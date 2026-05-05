const SW_VERSION = '2026-05-04-1';
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
