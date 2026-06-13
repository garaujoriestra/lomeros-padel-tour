// ── Service worker «Pista Central» ──
// 1. Cachea el app-shell (assets estáticos de Next, fuentes, iconos) para que
//    las aperturas repetidas pinten al instante sin esperar a la red.
// 2. Navegaciones: network-first con fallback offline (no cachea HTML dinámico
//    para no servir contenido de sesión obsoleto).
// 3. Mantiene las notificaciones push.

const VERSION = 'lpt-v1';
const STATIC_CACHE = `lpt-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icon', '/apple-icon'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Tolerante: si algún recurso falla (p. ej. /offline tras el primer
      // deploy) no abortamos la instalación del SW.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const STATIC_ASSET = /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|ico)$/;

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon' ||
    url.pathname === '/apple-icon' ||
    STATIC_ASSET.test(url.pathname)
  );
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Assets versionados de Next → cache-first (inmutables, hash en el nombre).
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Navegaciones → siempre red primero; si no hay red, página offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      })
    );
  }
});

// ── Push ──
self.addEventListener('push', function (event) {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icon',
    badge: '/icon',
    data: { url: data.url || '/' },
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.navigate(url).then((c) => (c || client).focus());
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
