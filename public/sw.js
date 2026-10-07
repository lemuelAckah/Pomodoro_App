const VERSION = "studyflow-v5"

/* Offline strategy — StudyFlow PWA
   - Navigations: network first (fresh deployments win), cached app shell
     as the offline fallback. A stale shell would reference asset hashes that
     no longer exist and boot would die, so the shell is refreshed on every
     activation and after any PRECACHE post.
   - Hashed /assets/*: cache first (the names are immutable fingerprints),
     network only on a miss.
   - Same-origin GETs that are NOT the app shell and NOT hashed assets:
     network first with a best-effort cache-on-success + cache fallback.
     Private/user-specific requests live on separate origins (Supabase) and
     therefore never enter this SW at all.
   - Everything cached is stored WITHOUT its `Vary` header. Vite answers
     with `Vary: Origin`, and module scripts fetch assets with CORS
     credentials, so a Vary-respecting match can disagree with the request
     that stored the entry — the cache hit then resolves to undefined and
     boot dies offline. Lookups pass ignoreVary for the same reason.

   Privacy / API boundary
   - Supabase auth and data requests go to project/api.supabase.co and are
     NOT intercepted by this worker. Do not add same-origin passthroughs
     that would re-enable caching of user data here.
   - Music/audio playback, community live features, uploads and timers rely
     on live network requests; this worker never caches POST bodies (it only
     handles GETs) and never claims ownership of cross-origin fetches.
   - Stale-version trap: a fresh build invalidates the cache name on deploy
     (VERSION), so a user who keeps the site open across a deploy is served
     by the previous worker until they reload, then the new worker takes
     over in activate. On a clean launch, the new shell is fetched fresh.

   Incompatible browsers
   - Registering the SW is best-effort. If ServiceWorker, caches or fetch
     events are absent, the page still loads normally; the app simply does
     not offer offline-cache guarantees beyond the browser default.
   - Do not throw or import anything that does not exist in the SW scope.
   - The page-side registration (src/app.js) reports the install-prompt and
     appinstalled lifecycle back to the install UI.
   */

const APP_SHELL = "/index.html"

function isStaticAsset(url) {
  return url.pathname.startsWith("/assets/")
}

function stripVary(response) {
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

function openCache() {
  return caches.open(VERSION)
}

async function fetchShell(useFallback) {
  try {
    const res = await fetch(APP_SHELL, { cache: "no-store" })
    if (res && res.ok) {
      const cache = await openCache()
      await cache.put(APP_SHELL, stripVary(res.clone()))
    }
    return res
  } catch (err) {
    if (!useFallback) throw err
    const cache = await openCache()
    const hit = await cache.match(APP_SHELL, { ignoreVary: true })
    if (!hit) throw new Error("offline and shell not cached")
    return hit
  }
}

self.addEventListener("install", (event) => {
  // Do not force skipWaiting here — the app handles worker updates by
  // reloading once the new worker activates, so users do not lose mid-flow
  // state when a deploy drops while they are using the app.
  event.waitUntil(fetchShell(false).catch(() => {}))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    clients
      .claim()
      .then(() => fetchShell(false))
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

self.addEventListener("message", (event) => {
  const data = event.data

  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting()
    return
  }

  if (data && data.type === "PRECACHE" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await openCache()

        await Promise.all(
          data.urls
            .filter((u) => typeof u === "string" && u.startsWith("/"))
            .map(async (assetUrl) => {
              try {
                const hit = await cache.match(assetUrl, { ignoreVary: true })
                if (hit) return

                const res = await fetch(assetUrl)
                if (res && res.ok) await cache.put(assetUrl, stripVary(res))
              } catch {
                /* best effort — runtime caching picks it up on first use */
              }
            }),
        )

        // Once precache lands, refresh the shell so a newly deployed build
        // does not serve an old HTML document offline.
        await fetchShell(false).catch(() => {})
      })(),
    )
  }
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Only handle same-origin requests. Supabase/auth/media origins are not
  // same-origin and are therefore never touched by this worker.
  if (url.origin !== location.origin) return

  // App shell: network first, cached fallback keeps reloads working offline.
  if (request.mode === "navigate") {
    event.respondWith(fetchShell(true))
    return
  }

  // Hashed build assets are immutable: cache first, populate on a miss.
  if (isStaticAsset(url)) {
    event.respondWith(
      openCache().then((cache) =>
        cache.match(request, { ignoreVary: true }).then(
          (hit) =>
            hit ||
            fetch(request)
              .then(async (res) => {
                if (res && res.ok)
                  await cache.put(request, stripVary(res.clone()))

                return res
              })
              .catch(() => hit),
        ),
      ),
    )
    return
  }

  // Other same-origin GETs: network first, cache-on-success, cache fallback.
  // This is deliberately scoped to non-privacy-sensitive same-origin falls
  // (e.g. the site root or other static paths that slip through). It is not
  // a blanket cache for application data.
  event.respondWith(
    fetch(request)
      .then(async (res) => {
        if (res && res.ok) {
          const cache = await openCache()
          await cache.put(request, stripVary(res.clone()))
        }

        return res
      })
      .catch(async () => {
        const cache = await openCache()
        return cache.match(request, { ignoreVary: true })
      }),
  )
})
