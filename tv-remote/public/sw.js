/* Service worker mínimo: cachea la interfaz para que la app abra instantánea
   y funcione aunque el WiFi tenga un bache. Las llamadas a /api/ nunca se
   cachean — un comando viejo servido desde caché sería un desastre. */
'use strict';

const CACHE = 'tv-remote-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;

  // Red primero, caché de respaldo: siempre preferimos la versión fresca.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
