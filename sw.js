// SEVO service worker — scoped to /sevo/ (GitHub Pages project site).
// Cache strategy is split by content type; see CACHE_VERSION for cache-busting on deploys.
const CACHE_VERSION = 'sevo-cache-v1';

// Relative to this file's own location (/sevo/sw.js), so these always resolve
// under the /sevo/ subpath regardless of where the repo is checked out/served from.
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const API_ORIGIN = 'https://sevo-backend.onrender.com';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Backend API — network-only, never cached. Don't intercept; let it fail
  // naturally so the app's own offline handling can catch it.
  if (url.origin === API_ORIGIN) return;

  // Everything else (core static assets same-origin, third-party CDN assets
  // like fonts): cache-first, refresh the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
