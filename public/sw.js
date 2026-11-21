// Service Worker do PWA + OneSignal Web Push (um único SW no escopo "/")
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE_NAME = 'up-mobilidade-v7';
const urlsToCache = [
  '/logo-horizontal.png',
  '/logo-icon.png',
  '/logo-card.png',
  '/sounds/new-ride-toq3.mp3'
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
  if (event.request.headers.get('range')) return;
  // Não interceptar chamadas de API nem manifests dinâmicos
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('manifest')
  ) {
    return;
  }
  // Não interceptar outros domínios (OneSignal, Google, fontes...)
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;

  // HTML sempre da rede primeiro (garante versão nova do app); cache só como fallback offline
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }

  // Chunks com hash (/assets/) e mídias locais usam Stale-While-Revalidate para abrir rápido no 4G
  const shouldCacheStatic =
    reqUrl.pathname.startsWith('/assets/') ||
    /\.(png|jpg|jpeg|svg|webp|woff2|mp3|css|js)$/i.test(reqUrl.pathname);

  if (shouldCacheStatic) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                cache.put(event.request, networkRes.clone()).catch(() => {});
              }
              return networkRes;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
