const VERSION = "studyflow-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    clients
      .claim()
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
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches
          .open(VERSION)
          .then((cache) => cache.put(request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (hit) =>
            hit ||
            caches.match("/index.html").then((fallback) => {
              if (!fallback) throw new Error("offline");
              return fallback;
            }),
        ),
      ),
  );
});
