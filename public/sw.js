// Bump this whenever this file's own logic changes, so old caches get
// cleared out. Note: Vite's build output uses hashed filenames for JS/CSS,
// so there's no fixed list of "shell files" to precache - the fetch
// handler below just caches whatever gets requested, network-first, which
// naturally warms the cache as pages are visited.
const CACHE_VERSION = "myfls-shell-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for everything same-origin: always prefer a fresh copy,
// falling back to whatever was last cached only when the network request
// fails - that's what keeps the tree/search usable offline.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never touch calls out to the Apps Script backend - those need a live
  // network round-trip (and the caller's session) every time.
  if (url.hostname.endsWith("script.google.com")) return;

  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
