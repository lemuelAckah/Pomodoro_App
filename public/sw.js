const VERSION = "studyflow-v3"

/* Offline strategy
   - Navigations: network first (fresh deployments win), cached app shell
     as the offline fallback.
   - Hashed /assets/*: cache first (the names are immutable fingerprints),
     network only on a miss.
   - Everything cached is stored WITHOUT its `Vary` header. Vite answers
     with `Vary: Origin`, and module scripts fetch assets with CORS
     credentials, so a Vary-respecting match can disagree with the request
     that stored the entry — the cache hit then resolves to undefined and
     boot dies offline. Lookups pass ignoreVary for the same reason. */
const NAVIGATE_FALLBACK = "/index.html"

function withoutVary(response) {
  try {
    const headers = new Headers(response.headers)

    if (!headers.has("vary")) return response

    headers.delete("vary")

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch {
    return response
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        const shell = await fetch(NAVIGATE_FALLBACK, { cache: "no-store" })

        if (shell && shell.ok)
          await cache.put(NAVIGATE_FALLBACK, withoutVary(shell))
      })
      .catch(() => {}),
  )

  self.skipWaiting()
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    clients
      .claim()
      .then(() =>
        // An update just landed: re-pull the shell so the cache can never
        // hold HTML from a previous build (it would reference asset hashes
        // that no longer exist and boot would die offline).
        caches.open(VERSION).then(async (cache) => {
          try {
            const shell = await fetch(NAVIGATE_FALLBACK, { cache: "no-store" })

            if (shell && shell.ok)
              await cache.put(NAVIGATE_FALLBACK, withoutVary(shell))
          } catch {
            /* offline — the install-time shell stays */
          }
        }),
      )
      .then(() =>
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
            ),
          ),
      )
      .catch(() => {}),
  )
})

// Store a response under `key`, stripping `Vary` first. Failures never
// break the request being served.
function store(cache, key, response) {
  return cache.put(key, withoutVary(response)).catch(() => {})
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (url.origin !== location.origin) return

  // App shell: network first, cached shell keeps reloads working offline.
  // The refresh-put is chained INTO the respondWith promise — a detached
  // event.waitUntil() inside this callback is dropped by Chrome, which is
  // how the cache once ended up serving a stale shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            await store(
              await caches.open(VERSION),
              NAVIGATE_FALLBACK,
              response.clone(),
            )
          }

          return response
        })
        .catch(async () => {
          const hit = await caches
            .open(VERSION)
            .then((cache) => cache.match(NAVIGATE_FALLBACK, { ignoreVary: true }))
          if (!hit) throw new Error("offline and shell not cached")
          return hit
        }),
    )
    return
  }

  // Hashed build assets are immutable: cache first, populate on a miss.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(request, { ignoreVary: true }).then(
          (hit) =>
            hit ||
            fetch(request).then(async (response) => {
              if (response && response.ok)
                await store(cache, request, response.clone())

              return response
            }),
        ),
      ),
    )
    return
  }

  // Other same-origin GETs: network first, cache-on-success, cache fallback.
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response && response.ok)
          await store(
            await caches.open(VERSION),
            request,
            response.clone(),
          )

        return response
      })
      .catch(async () => {
        const cache = await caches.open(VERSION)
        return cache.match(request, { ignoreVary: true })
      }),
  )
})

/* Precache: the page posts { type: "PRECACHE", urls: [...] } once per boot
   with the hashed assets seen so far (lazy route chunks, CSS). The SW
   fetches anything missing so offline tab navigation works even for tabs
   the user never opened online. */
self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || data.type !== "PRECACHE" || !Array.isArray(data.urls)) return

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(VERSION)

        await Promise.all(
          data.urls
            .filter((u) => typeof u === "string" && u.startsWith("/"))
            .map(async (assetUrl) => {
              try {
                const hit = await cache.match(assetUrl, { ignoreVary: true })
                if (hit) return

                const res = await fetch(assetUrl)
                if (res && res.ok) await cache.put(assetUrl, withoutVary(res))
              } catch {
                /* best effort — runtime caching picks it up on first use */
              }
            }),
        )
      } catch {
        /* ignore */
      }
    })(),
  )
})
