const SW_VERSION = '2026-11-26-1';
const LOGO_CACHE = `g22-logo-cache-${SW_VERSION}`;
const STATIC_CACHE = `g22-static-cache-${SW_VERSION}`;
const OWNED_CACHE_PREFIXES = ['g22-logo-cache-', 'g22-static-cache-', 'g22-runtime-cache-', 'g22-app-cache-'];
const MAX_LOGO_CACHE_ENTRIES = 120;
const MAX_STATIC_CACHE_ENTRIES = 40;
const MAX_CACHEABLE_RESPONSE_BYTES = 150_000;

/*
 * Rugby Seven sin conexión.
 *
 * El juego no necesita internet para jugarse: los equipos van en el código y las
 * partidas en el navegador. Lo que faltaba era tener a mano la página y sus
 * archivos. Su caché NO lleva SW_VERSION y no la borra el `activate`: una
 * versión nueva del service worker no puede dejar a nadie sin el juego en el
 * colectivo. Se renueva sola: cada vez que el juego abre con conexión le manda
 * al SW la lista exacta de lo que usó, y lo que ya no está en la lista se va.
 */
const GAME_CACHE = 'g22-game-cache-rugby-seven';
const GAME_PATH = '/juegos/minijuegos/rugby-seven';
const GAME_ASSET_PREFIXES = ['/_next/static/', '/juegos/rugby-seven/', '/flags/'];
const GAME_NAVIGATION_TIMEOUT_MS = 4000;

function isGamePath(pathname) {
  return pathname === GAME_PATH || pathname === `${GAME_PATH}/`;
}

function isGameAsset(url) {
  return GAME_ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) || url.pathname === '/icon.png';
}

/** La página del juego: primero la red (para tener la última versión), y sin red la guardada. */
async function gameNavigation(request) {
  const cache = await caches.open(GAME_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), GAME_NAVIGATION_TIMEOUT_MS)),
    ]);
    if (response && response.ok) await cache.put(GAME_PATH, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(GAME_PATH);
    if (cached) return cached;
    throw error;
  }
}

/** El cartel de "sin conexión" para las páginas que no se guardan. */
async function offlinePage() {
  const cache = await caches.open(GAME_CACHE);
  const hasGame = Boolean(await cache.match(GAME_PATH));
  const action = hasGame
    ? `<a href="${GAME_PATH}">Jugar Rugby Seven</a><p class="hint">El juego quedó guardado en este dispositivo: se juega sin señal.</p>`
    : '<p class="hint">Cuando vuelva la señal, el sitio carga solo.</p>';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · G22 Scores</title><style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f2f4f8;font:16px/1.4 system-ui,-apple-system,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:1.3rem;margin:0 0 8px}p{margin:0;color:#a7adb8}.hint{margin-top:14px;font-size:.85rem}
a{display:inline-block;margin-top:22px;padding:14px 24px;border-radius:999px;background:#8fff00;color:#0b0d12;font-weight:800;text-decoration:none}
</style></head><body><main><h1>Sin conexión</h1><p>No hay internet para cargar esta página.</p>${action}</main></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Lo que se carga en OBS/vMix (no el generador ni el panel de control, que mira una persona). */
function isBroadcastOverlay(pathname) {
  return pathname.startsWith('/overlay/') && !pathname.startsWith('/overlay/control/');
}

function overlayRetryPage() {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>G22 overlay</title>'
    + '<style>html,body{margin:0;background:transparent}</style>'
    + '<script>setTimeout(function(){location.reload()},5000)</script></head><body></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Deja en la caché exactamente lo que el juego dijo que usa: suma lo nuevo y saca lo viejo. */
async function syncGameCache(urls) {
  const cache = await caches.open(GAME_CACHE);
  const wanted = new Set(
    urls
      .map((value) => {
        try {
          const url = new URL(value, self.location.origin);
          return isSameOrigin(url) && (isGamePath(url.pathname) || isGameAsset(url)) ? url.href : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );
  const pageUrl = new URL(GAME_PATH, self.location.origin).href;
  wanted.add(pageUrl);

  const existing = await cache.keys();
  const have = new Set(existing.map((request) => request.url));
  await Promise.all(existing.filter((request) => !wanted.has(request.url)).map((request) => cache.delete(request)));

  let failed = 0;
  // Lo que no existe en el servidor (una bandera que falta) no es una falla: no hay nada que
  // guardar y el juego ya lo muestra roto con conexión. Se informa aparte para poder arreglarlo.
  const notFound = [];
  // De a pocos: son ~100 banderas y los chunks del juego, y el celular puede estar con mala señal.
  // Primero lo indispensable para abrir y jugar (la página y el código), después música y banderas:
  // si el visitante cierra a la mitad, o la señal es mala, el juego ya queda jugable.
  const rank = (url) => (url === pageUrl ? 0 : url.includes('/_next/static/') ? 1 : url.includes('/juegos/rugby-seven/') ? 3 : 2);
  const pending = [...wanted].filter((url) => !have.has(url) || url === pageUrl).sort((a, b) => rank(a) - rank(b));
  for (let i = 0; i < pending.length; i += 8) {
    await Promise.all(pending.slice(i, i + 8).map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.status === 404) {
          notFound.push(new URL(url).pathname);
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        await cache.put(url, response);
      } catch {
        failed += 1;
      }
    }));
  }
  return { total: wanted.size, failed, notFound: notFound.slice(0, 20) };
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'g22-game-cache' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const result = await syncGameCache(data.urls).catch(() => ({ total: 0, failed: -1 }));
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({ type: 'g22-game-cache-done', ...result });
    }
  })());
});

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
  const request = event.request;
  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (isSameOrigin(url)) {
      if (request.mode === 'navigate' && isGamePath(url.pathname)) {
        event.respondWith(gameNavigation(request));
        return;
      }
      // Cualquier otra página sin red: en vez de la pantalla de error del navegador, un cartel que
      // lleva al juego si está guardado. Con red no cambia nada: el pedido sale igual que siempre
      // (y con su redirect en "manual", que es como llega una navegación).
      // Un overlay de transmisión (OBS/vMix) sin red no puede mostrar un cartel: sale al aire.
      // Página transparente que reintenta sola hasta que vuelva la conexión.
      if (request.mode === 'navigate' && isBroadcastOverlay(url.pathname)) {
        event.respondWith(fetch(request).catch(() => overlayRetryPage()));
        return;
      }
      if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => offlinePage()));
        return;
      }
      // Solo lo que el juego guardó; el resto del sitio sigue por su camino de siempre.
      if (isGameAsset(url) && url.pathname !== '/api/assets/team-logo') {
        event.respondWith((async () => {
          const cache = await caches.open(GAME_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          const target = getCacheTarget(request);
          return target ? staleWhileRevalidate(request, target.cacheName, target.maxEntries) : fetch(request);
        })());
        return;
      }
    }
  }

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
  // El aviso en vivo trae su destino armado: se respeta, pero solo si es una
  // ruta propia (nunca una URL externa).
  if (notification && typeof notification.url === 'string' && notification.url.startsWith('/') && !notification.url.startsWith('//')) {
    return notification.url;
  }

  if (notification && notification.match_id) {
    return `/matches/${notification.match_id}`;
  }

  // Partido externo: sin fila propia, el id viaja en entity_id.
  if (notification && notification.entity_type === 'match' && notification.entity_id) {
    return `/matches/${notification.entity_id}`;
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

    // El push del cron trae titulo, cuerpo y destino cifrados adentro; la
    // consulta a /api/notifications queda solo para un push viejo sin payload.
    // Si esa consulta falla (sesion vencida, red caida), salir sin dibujar nada
    // deja el push mudo, que desde el celular no se distingue de uno que nunca
    // llego. Ademas la suscripcion es userVisibleOnly: los navegadores castigan
    // al que recibe un push y no muestra nada.
    if (!notification) {
      notification = {
        title: 'G22 Scores',
        body: 'Tenes novedades de tus equipos seguidos.',
      };
    }

    const targetUrl = getNotificationTarget(notification);

    // Con `tag` propio (aviso en vivo de un partido) la notificacion nueva
    // REEMPLAZA a la anterior del mismo partido en la bandeja: un solo cartel
    // con el marcador, no una pila. Sin `tag` cada aviso es el suyo.
    const hasOwnTag = typeof notification.tag === 'string' && notification.tag.length > 0;
    const tag = hasOwnTag
      ? notification.tag
      : (notification.id ? `g22-${notification.id}` : 'g22-notification');

    const options = {
      body: notification.body || 'Hay novedades de tus equipos favoritos.',
      icon: '/icon.png',
      badge: '/icon.png',
      tag,
      data: {
        url: targetUrl,
        notificationId: notification.id || null,
      },
    };

    if (typeof notification.timestamp === 'number') options.timestamp = notification.timestamp;
    // `renotify` exige `tag`: sin el, Chrome tira TypeError y el aviso no sale.
    // En iPhone lo ignoran; en Android hace sonar el hito aunque reemplace.
    if (hasOwnTag && notification.renotify === true) options.renotify = true;
    if (notification.silent === true) options.silent = true;
    if (notification.requireInteraction === true) options.requireInteraction = true;
    if (notification.kind === 'live') {
      options.actions = [{ action: 'open', title: 'Ver partido' }];
    }

    try {
      await self.registration.showNotification(notification.title || 'G22 Scores', options);
    } catch (error) {
      // Una opcion que el navegador no soporta no puede dejar el push mudo:
      // se reintenta con lo minimo, que es lo que siempre funciono.
      await self.registration.showNotification(notification.title || 'G22 Scores', {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
        data: options.data,
      });
    }
  })());
});

// El navegador puede rotar la suscripcion por su cuenta (vence, cambia el push
// service). Si no se vuelve a suscribir aca, el endpoint viejo rebota con 410,
// el cron lo apaga y el usuario deja de recibir avisos sin haber tocado nada.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const previous = event.oldSubscription || null;
    const applicationServerKey = previous && previous.options
      ? previous.options.applicationServerKey
      : null;

    if (!applicationServerKey) return;

    let renewed = event.newSubscription || null;
    if (!renewed) {
      renewed = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    if (previous && previous.endpoint && previous.endpoint !== renewed.endpoint) {
      await fetch('/api/notifications/system', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: previous.endpoint }),
      }).catch(() => undefined);
    }

    await fetch('/api/notifications/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        subscription: renewed.toJSON(),
        userAgent: self.navigator ? self.navigator.userAgent : null,
        platform: 'service-worker',
      }),
    }).catch(() => undefined);
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
        // En ventanas "no controladas" navigate() rechaza; sin este catch el toque
        // en el aviso no hacia nada. Se cae a abrir una ventana nueva.
        try {
          return await client.navigate(targetUrl);
        } catch {
          break;
        }
      }
      return undefined;
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }

    return undefined;
  })());
});
