// Bump this whenever any shell file (html/css/js/icons) changes, so
// clients pick up the new version instead of serving stale cached files.
const CACHE_VERSION = 'myfls-shell-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'config.js',
  'manifest.json',
  'acc-logo.png',
  'fls-logo.png',
  'icon-192.png',
  'icon-512.png',
  'data/sources.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache calls out to the Apps Script backend - those need a live
  // network round-trip (and the caller's Google sign-in) every time.
  if (url.hostname.endsWith('script.google.com')) return;

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Per-source data files: network-first, so a source's document list
  // stays fresh when online, but still opens from cache when offline
  // after having been viewed at least once.
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: cache-first for speed, falling back to network.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
