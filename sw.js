// Bump this whenever any shell file (html/css/js/icons) changes, so old
// caches get cleared out (the fetch strategy below is network-first, so
// this mainly just keeps the cache from growing stale entries forever).
const CACHE_VERSION = 'myfls-shell-v2';

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

// Network-first for everything same-origin: always prefer a fresh copy
// (config.js, data files, and the app code itself can all change between
// visits), falling back to whatever was last cached only when the network
// request fails - that's what keeps the tree/search usable offline.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch calls out to the Apps Script backend - those need a live
  // network round-trip (and the caller's Google sign-in) every time.
  if (url.hostname.endsWith('script.google.com')) return;

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

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
