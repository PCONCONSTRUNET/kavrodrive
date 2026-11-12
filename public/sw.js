// Service Worker do PWA + OneSignal Web Push (um único SW no escopo "/")
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE_NAME = 'up-mobilidade-v5';
const urlsToCache = [
  '/logo-horizontal.png',
  '/logo-icon.png',
  '/logo-card.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Não interceptar chamadas de API nem manifests dinâmicos
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('manifest')
  ) {
    return;
  }
  // Não interceptar outros domínios (OneSignal, Google, fontes...)
  if (new URL(event.request.url).origin !== self.location.origin) return;
  // HTML sempre da rede primeiro (garante versão nova do app); cache só como fallback offline
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
