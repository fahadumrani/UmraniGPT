/* ============================================
   UMRANIGPT - Service Worker
   ============================================ */
'use strict';

const CACHE_NAME    = 'umranigpt-v1.5.0';
const STATIC_CACHE  = 'umranigpt-static-v1.5';
const DYNAMIC_CACHE = 'umranigpt-dynamic-v1.5';

/* Assets to cache on install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/assets/logo.svg',

  /* CSS modules */
  '/css/variables.css',
  '/css/animations.css',
  '/css/layout.css',
  '/css/sidebar.css',
  '/css/chat.css',
  '/css/components.css',
  '/css/modal.css',
  '/css/responsive.css',
  '/css/auth.css',
  '/css/admin.css',
  '/css/cursor.css',

  /* JS modules */
  '/js/config.js',
  '/js/utils.js',
  '/js/storage.js',
  '/js/security.js',
  '/js/notifications.js',
  '/js/theme.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/cursor.js',
  '/js/voice.js',
  '/js/markdown.js',
  '/js/codeblock.js',
  '/js/search.js',
  '/js/docextract.js',
  '/js/dragdrop.js',
  '/js/history.js',
  '/js/sidebar.js',
  '/js/settings.js',
  '/js/shortcuts.js',
  '/js/chat.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/page-login.js',
  '/js/page-signup.js',

  /* Services */
  '/services/stream.js',
  '/services/ollama.js',
];

/* CDN resources to cache (network-first) */
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
];

/* ---- Install ---- */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const results = await Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('Pre-cache miss:', url, err))
        )
      );
      console.log('[SW] Pre-cached assets:', results.filter(r => r.status === 'fulfilled').length);
    })
  );
});

/* ---- Activate ---- */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---- Fetch ---- */
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  /* Skip non-GET and browser-extension requests */
  if (request.method !== 'GET') return;
  if (!['http:', 'https:'].includes(url.protocol)) return;

  /* Skip Ollama API requests — never cache AI responses */
  if (url.pathname.startsWith('/api/')) return;
  if (isOllamaRequest(url)) return;

  /* CDN resources: stale-while-revalidate */
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  /* App shell: cache-first */
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* External: network-first */
  e.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

/* ---- Strategies ---- */

const cacheFirst = async (request, cacheName) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
};

const networkFirst = async (request, cacheName) => {
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || offlineFallback(request);
};

/* ---- Offline fallback ---- */
const offlineFallback = async (request) => {
  const url = new URL(request.url);
  if (request.destination === 'document' || url.pathname === '/') {
    const cached = await caches.match('/index.html');
    if (cached) return cached;
  }

  return new Response(
    JSON.stringify({ error: 'You are offline', offline: true }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
};

/* ---- Helpers ---- */
const isOllamaRequest = (url) => {
  return url.pathname.startsWith('/api/') ||
    url.hostname.endsWith('.trycloudflare.com') ||
    url.port === '11434';
};

/* ---- Background sync (if supported) ---- */
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-chats') {
    console.log('[SW] Background sync: sync-chats');
  }
});

/* ---- Push notifications (placeholder) ---- */
self.addEventListener('push', (e) => {
  const data = e.data?.json() || {};
  self.registration.showNotification(data.title || 'UmraniGPT', {
    body: data.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-96.png',
    tag: 'umranigpt',
  });
});

/* ---- Notification click ---- */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});

/* ---- Message from client ---- */
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') {
    e.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => e.source?.postMessage({ type: 'CACHE_CLEARED' }))
    );
  }
});
