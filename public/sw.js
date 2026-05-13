const SW_VERSION = '2026-05-12-1';
const LOGO_CACHE = `g22-logo-cache-${SW_VERSION}`;
const STATIC_CACHE = `g22-static-cache-${SW_VERSION}`;
const OWNED_CACHE_PREFIXES = ['g22-logo-cache-', 'g22-static-cache-', 'g22-runtime-cache-', 'g22-app-cache-'];
const MAX_LOGO_CACHE_ENTRIES = 120;
const MAX_STATIC_CACHE_ENTRIES = 40;
const MAX_CACHEABLE_RESPONSE_BYTES = 150_000;

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function getCacheTarget(request) {
  if (request.method !== 'GET') return null;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return null;

  if (url.pathname === '/api/assets/team-logo') {
    return { cacheName: LOGO_CACHE, maxEntries: MAX_LOGO_CACHE_ENTRIES };
  }

  if (
    url.pathname.startsWith('/logos/clubs/') ||
    url.pathname === '/icon.png' ||
    url.pathname === '/manifest.json'
  ) {
    return { cacheName: STATIC_CACHE, maxEntries: MAX_STATIC_CACHE_ENTRIES };
  }

  return null;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  await Promise.all(keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)));
}

async function isResponseCacheable(response) {
  if (!response || !response.ok) return false;
  if (response.type === 'opaque') return false;

  const contentLength = Number(response.headers.get('Content-Length') || '0');
  if (contentLength > 0) return contentLength <= MAX_CACHEABLE_RESPONSE_BYTES;

  try {
    const blob = await response.clone().blob();
    return blob.size <= MAX_CACHEABLE_RESPONSE_BYTES;
  } catch {
    return false;
  }
}

async function fetchAndCache(request, cacheName, maxEntries) {
  const response = await fetch(request);
  if (await isResponseCacheable(response)) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    await trimCache(cacheName, maxEntries);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    fetchAndCache(request, cacheName, maxEntries).catch(() => undefined);
    return cached;
  }

  return fetchAndCache(request, cacheName, maxEntries);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => OWNED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
        .filter((name) => name !== LOGO_CACHE && name !== STATIC_CACHE)
        .map((name) => caches.delete(name)),
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const target = getCacheTarget(event.request);
  if (!target) return;

  event.respondWith(staleWhileRevalidate(event.request, target.cacheName, target.maxEntries));
});

async function getLatestUnreadNotification() {
  const response = await fetch('/api/notifications?limit=1&unread=true', {
    cache: 'no-store',
    credentials: 'include',
  });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  const notification = payload && Array.isArray(payload.notifications)
    ? payload.notifications[0]
    : null;

  if (!notification || typeof notification.title !== 'string') {
    return null;
  }

  return notification;
}

function getNotificationTarget(notification) {
  if (notification && notification.match_id) {
    return `/matches/${notification.match_id}`;
  }

  if (notification && notification.entity_type === 'club') {
    return `/clubs/${notification.entity_id}`;
  }

  if (notification && notification.entity_type === 'tournament') {
    return `/tournaments/${notification.entity_id}`;
  }

  return '/notifications';
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let notification = null;

    if (event.data) {
      try {
        notification = event.data.json();
      } catch {
        notification = null;
      }
    }

    if (!notification) {
      notification = await getLatestUnreadNotification();
    }

    if (!notification) return;

    const targetUrl = getNotificationTarget(notification);
    await self.registration.showNotification(notification.title || 'G22 Scores', {
      body: notification.body || 'Hay novedades de tus equipos favoritos.',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: notification.id ? `g22-${notification.id}` : 'g22-notification',
      data: {
        url: targetUrl,
        notificationId: notification.id || null,
      },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification && event.notification.data ? event.notification.data : {};
  const targetPath = typeof data.url === 'string' && data.url ? data.url : '/notifications';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      if (!client.url.startsWith(self.location.origin)) continue;

      await client.focus();
      if ('navigate' in client) {
        return client.navigate(targetUrl);
      }
      return undefined;
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }

    return undefined;
  })());
});
