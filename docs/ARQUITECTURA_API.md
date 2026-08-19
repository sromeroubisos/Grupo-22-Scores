# Arquitectura de APIs — Grupo-22-Scores

> Cómo funcionan las APIs de la web y cómo se hacen los llamados.
> Referencia para desarrollo, onboarding y debugging. Todos los enlaces apuntan a `archivo:línea`.

---

## 1. Visión general

El sistema tiene **tres capas de API** bien separadas:

```
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 3 — FRONTEND ('use client')                                 │
│  Componentes React + hooks (useMatchesStore, useFavorites...)     │
│  fetch('/api/...') nativo  +  createBrowserClient (Supabase auth) │
└───────────────┬───────────────────────────────┬───────────────────┘
                │ HTTP (cookie de sesión)        │ Supabase JS (anon)
                ▼                                 ▼
┌─────────────────────────────────────────┐  ┌────────────────────────┐
│  CAPA 2 — RUTAS INTERNAS (Next.js)       │  │  Supabase Auth / RLS    │
│  ~177 route.ts en src/app/api/*          │  │  (queries directas      │
│  auth/roles + Supabase (anon/service)    │  │   acotadas: favoritos)  │
└───────────────┬─────────────────┬─────────┘  └────────────────────────┘
                │                 │
                ▼                 ▼
┌──────────────────────┐  ┌──────────────────────────────────────────┐
│  Supabase (Postgres) │  │  CAPA 1 — APIs EXTERNAS                    │
│  DB del proyecto     │  │  FlashScore · ESPN · SofaScore · MercadoPago│
│  (RLS / service-role)│  │  todo vía apiFetch() + memoryCache         │
└──────────────────────┘  └──────────────────────────────────────────┘
```

- **Capa 3 (Frontend)**: pide datos a `/api/...` con `fetch` nativo y, para auth/algunas queries, habla directo con Supabase desde el navegador.
- **Capa 2 (Rutas internas)**: orquesta. Autentica/autoriza, lee de la DB y/o llama a las fuentes externas, y normaliza la respuesta.
- **Capa 1 (Externas)**: proveedores de datos deportivos y de pagos. Toda llamada HTTP saliente pasa por un único wrapper.

---

## 2. Capa 1 — APIs externas

### 2.1 El wrapper común: `apiFetch()`

Toda llamada HTTP saliente (FlashScore, ESPN, SofaScore) pasa por [src/lib/apiFetch.ts](../src/lib/apiFetch.ts).

- **Timeout fijo de 25s** vía `AbortController` ([apiFetch.ts:33](../src/lib/apiFetch.ts#L33)). También encadena cualquier `signal` externo que se le pase ([apiFetch.ts:37-41](../src/lib/apiFetch.ts#L37-L41)).
- **Nunca lanza**: ante error o respuesta no-OK devuelve `{ data: null, debug }` ([apiFetch.ts:78](../src/lib/apiFetch.ts#L78), [apiFetch.ts:96](../src/lib/apiFetch.ts#L96)). En el `debug`, `status` = 408 si fue timeout, 500 si error genérico ([apiFetch.ts:89](../src/lib/apiFetch.ts#L89)).
- **Cache HTTP de Next**: si `cacheTtl > 0` usa `cache: "default"` + `next: { revalidate }`; si no, `"no-store"` ([apiFetch.ts:27-29](../src/lib/apiFetch.ts#L27-L29), [apiFetch.ts:49](../src/lib/apiFetch.ts#L49)).
- **Logging**: cada llamada loguea `[API Call] <tag> - Status: <n> - <url> (<ms>ms)` ([apiFetch.ts:75](../src/lib/apiFetch.ts#L75)). `silent: true` suprime el log de error.

Firma:

```ts
apiFetch<T>(url, {
  ...RequestInit,
  debugTag?: string,   // etiqueta para los logs
  silent?: boolean,    // no loguear errores
  cacheTtl?: number,   // segundos; 0 = no cache HTTP
}): Promise<{ data: T | null; debug: ApiDebug }>
```

### 2.2 La cache en memoria: `memoryCache`

[src/lib/cache.ts](../src/lib/cache.ts) — `Map` con TTL por entrada (en segundos al setear, ms internamente).

- `get` devuelve `null` y borra la entrada si expiró ([cache.ts:34-37](../src/lib/cache.ts#L34-L37)).
- `deleteByPrefix(prefix)` para invalidación selectiva por familia de claves ([cache.ts:51-61](../src/lib/cache.ts#L51-L61)).
- Autolimpieza cada 5 min **solo en server** (`typeof window === 'undefined'`) ([cache.ts:91-96](../src/lib/cache.ts#L91-L96)).

Patrón de uso típico en los servicios: buscar en `memoryCache` → si miss, `apiFetch` → guardar resultado en `memoryCache` con su TTL.

### 2.3 Proveedores

| Proveedor | Tipo | Auth | Base URL | Cache | Timeout |
|-----------|------|------|----------|-------|---------|
| **FlashScore** | REST (RapidAPI) | `x-rapidapi-key` + `x-rapidapi-host` | `flashscore4.p.rapidapi.com/api/flashscore/v2/*` | memoryCache (TTL dinámico) | 25s |
| **ESPN** | REST público | — | `site.api.espn.com/apis/*` | memoryCache + dedupe | 25s |
| **SofaScore** | Microservicio propio | `x-service-token` (opcional) | `SOFASCORE_SERVICE_URL/v1/*` | memoryCache | default |
| **MercadoPago** | SDK oficial | `MP_ACCESS_TOKEN` | (SDK) | — | 10s |
| **Supabase** | Postgres remoto (SDK) | JWT anon / service-role | `NEXT_PUBLIC_SUPABASE_URL` | — | default |

#### FlashScore — [src/lib/services/flashscore.ts](../src/lib/services/flashscore.ts)

- Key desde `RAPIDAPI_KEY` — **server-only, sin `NEXT_PUBLIC_`**: el prefijo haría que Next incruste la clave paga en el bundle del cliente. El módulo tira error si se lo importa desde un componente cliente. Host desde `RAPIDAPI_HOST` (o `NEXT_PUBLIC_RAPIDAPI_HOST`, que no es secreto).
- **Control de concurrencia**: máximo 3 llamadas simultáneas (`MAX_CONCURRENT_API = 3`) con cola de espera, para evitar el efecto "thundering herd" cuando el navegador dispara muchos requests.
- **Dedupe de requests en vuelo**: si ya hay una llamada idéntica en curso, se reusa la misma promesa.
- **TTL dinámico**: listas 60s, live 5s, detalles 30s, equipos/torneos 24h. Caso especial: rugby a ±1 día de hoy → 30s.
- **Mapeo de deportes** a `sport_id` numérico (fútbol=1, tenis=2, básquet=3, rugby union=8, rugby league=19, …).
- Funciones principales: `getFlashScoreMatchesRaw`, `getFlashScoreMatches`, `getFlashScoreLiveMatches`, `getFlashScoreMatchDetails`, `getTeamDetails`, `getTournamentStandings`, `searchFlashScore`, etc.

#### ESPN — `espnFootball.ts`, `espnAmericanFootball.ts`, `espnMotorsport.ts`

API pública (sin key). Mismo patrón vía `fetchEspnJson` con `memoryCache` + dedupe de in-flight requests. El fútbol se delega a ESPN aunque la app exponga "FlashScore" en otros deportes.

#### SofaScore — [src/lib/services/sofascore.ts](../src/lib/services/sofascore.ts)

**No es la API pública de SofaScore**: es un **microservicio interno propio** (Python) detrás de `SOFASCORE_SERVICE_URL`. Auth opcional con header `x-service-token`. Devuelve `null` en 404; lanza `SofaScoreServiceError` en otros errores. IDs con prefijos (`ss-match-`, `ss-team-`, …).

#### MercadoPago — [src/lib/billing/mercadopago.ts](../src/lib/billing/mercadopago.ts)

SDK oficial `mercadopago`, cliente singleton con timeout 10s. Funciones: `createPreapproval` (suscripción), `getPreapproval`, `getPayment`, `cancelPreapproval`. Usa `idempotencyKey` para evitar duplicados y `usdToArs()` para convertir el precio (tasa `MP_USD_TO_ARS_RATE`).

### 2.4 Ejemplo end-to-end: una llamada a FlashScore

Usuario en Argentina pide partidos de rugby de mañana:

1. **Servicio** (`getFlashScoreMatchesRaw`) calcula `dayOffset` y arma la **cache key incluyendo timezone**: `matches-list:v3-1-8-America/Argentina/Buenos_Aires`.
2. Consulta `memoryCache`. Si hay hit válido → retorna sin red.
3. Si miss: `acquireSlot()` (espera turno entre los 3 cupos de concurrencia) y construye la URL:
   ```
   https://flashscore4.p.rapidapi.com/api/flashscore/v2/matches/list
     ?day=1&sport_id=8&timezone=America%2FArgentina%2FBuenos_Aires
   ```
4. Llama `apiFetch(url, { headers: { 'x-rapidapi-key', 'x-rapidapi-host' }, cacheTtl: 0, silent: true })`.
5. `apiFetch` aplica timeout 25s, hace `fetch`, parsea JSON y devuelve `{ data, debug }` (o `{ data: null }` si falla).
6. El servicio guarda `data` en `memoryCache` con TTL dinámico (rugby ~hoy → 30s), libera el cupo y limpia el registro de in-flight.
7. Mapea cada evento a `Match`, filtra por `formatDateKey(scheduledAt, tz) === targetDateKey` y devuelve el array.

---

## 3. Capa 2 — Rutas API internas (Next.js Route Handlers)

~177 archivos `route.ts` bajo [src/app/api/](../src/app/api/), agrupados por dominio: `matches`, `teams`, `clubs`, `tournaments`, `players`, `rankings`, `admin/torneo`, `admin/super`, `admin/tournaments`, `club-admin`, `auth`, `billing` / `checkout`, `cron`, `webhooks`, `prode`, `results`, etc.

### 3.1 Patrón estándar de un handler

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET(request: NextRequest) {
  try {
    // 1) Leer query params
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // 2) Cliente Supabase (anon, con la sesión del usuario por cookie)
    const supabase = await createClient();

    // 3) Auth/Autorización (cuando aplica)
    const context = await requireUserAccessContext(supabase);
    // ...checks de rol/membership...

    // 4) Consultar
    const { data, error } = await supabase.from('tabla').select('*').eq('id', id).single();
    if (error) return err('Not found', 404);

    // 5) Responder (con Cache-Control si es público)
    return NextResponse.json({ data });
  } catch (e) {
    console.error(e);
    return err('Internal server error', 500);
  }
}
```

- **Query params**: `new URL(request.url).searchParams`.
- **Dynamic params** (App Router): son **Promises** — hay que hacer `const { id } = await params`.
- **Métodos**: se exporta una función por verbo (`GET`, `POST`, `PATCH`, `DELETE`).
- **Errores**: helper `err(msg, status, details)` que devuelve `NextResponse.json`.

### 3.2 Autenticación y autorización

Helpers en [src/lib/auth/permissions.ts](../src/lib/auth/permissions.ts) y [src/lib/auth/roles.ts](../src/lib/auth/roles.ts). Modelo **multi-tier**:

1. **Usuario anónimo** — solo lecturas públicas (`is_visible`, `review_status = approved`).
2. **Membership scoped** — rol acotado a un scope (club / unión / torneo): `admin`, `editor`, `operator`, `viewer`. Sets de roles: `VIEW_/MANAGEMENT_/EDIT_/ADMIN_ONLY_MEMBERSHIP_ROLES`.
3. **Admin global** — `super_admin` / `admin_general`: acceso a todo.

Flujo típico de autorización en una mutación:

```ts
const context = await requireUserAccessContext(supabase);          // exige sesión
const target  = await getMatchManagementTarget(supabase, matchId); // datos del recurso
if (!target || !canManageMatchContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
  return err('Forbidden', 403);
}
// recién acá se escribe con service-role
```

Helpers clave: `requireUserAccessContext`, `canManageMatchContext`, `canManageClubContext`, `ensureMatchManagementAccess`, `hasScopedMembershipAccess`, `isGlobalAdminRole`.

> **Nota de diseño** (ver memoria del proyecto): el acceso a editar un partido es **scoped al torneo del partido**, no un permiso "blanket" por tener rol admin. `GET /api/matches/[id]/can-edit` devuelve siempre 200 con `{ canEdit: boolean }` para que el front decida si muestra el botón.

### 3.3 Clientes Supabase en el backend

- **Anon** (`createClient()` de `@/lib/supabase/server`): respeta RLS, lleva la sesión del usuario por cookie. Para lecturas y para autorizar.
- **Service-role** (`getServiceWriter` / `createAdminClient`): **bypassa RLS**, solo server-side, nunca se expone la key. Para escrituras admin (import de torneos, checkout, ajustes super-admin).
- **Read client con fallback de columnas**: en `/api/matches` la query prueba variantes de `select` para tolerar distintas versiones del schema (`MATCHES_DB_SELECT_VARIANTS`).

### 3.4 Ruta más representativa: `GET /api/matches`

[src/app/api/matches/route.ts](../src/app/api/matches/route.ts) — la más compleja. Query params: `date`, `sport`, `status`, `tz`, `live`, `external`.

- Si `live=true` → `getFlashScoreLiveMatches()` + partidos live de la DB.
- Si `external=true` → FlashScore enriquecido con datos locales.
- Por defecto → solo DB (Supabase).
- Usa `memoryCache`, persiste snapshots en `matches_feed_snapshots` (service-role) y setea `Cache-Control` según contexto (público: `max-age` alto).

### 3.5 Endurecimiento

- **Rate limiting** por IP: [src/lib/rateLimit.ts](../src/lib/rateLimit.ts) — `rateLimitByIp` (genérico) y límites más estrictos para auth. Devuelve 429 + `Retry-After`.
- **Same-origin check**: `isSameOriginRequest` rechaza CORS cross-origin en rutas sensibles (ej. `auth/sync-user`).

---

## 4. Capa 3 — Frontend → Backend

Componentes `'use client'` que consumen `/api/...`.

### 4.1 Patrón de llamada

`fetch()` **nativo**, sin SWR ni react-query:

```ts
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/matches/${encodeURIComponent(matchId)}?sport=${sportId}`, {
    signal: controller.signal,
    cache: 'no-store',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((payload) => {
      if (!payload || controller.signal.aborted) return;
      // ...usar datos...
    })
    .catch(() => {});            // error silencioso
  return () => controller.abort(); // cancelar al desmontar
}, [matchId, sportId]);
```

- `AbortController` para cancelar en unmount.
- `cache: 'no-store'` para datos vivos.
- `.catch(() => {})` silencioso en muchos casos.

### 4.2 Hooks/stores propios

[src/hooks/useMatchesStore.ts](../src/hooks/useMatchesStore.ts) centraliza el fetch de partidos:

- **Stale-while-revalidate**: cache en `Map` a nivel de módulo, TTL público 5 min. Muestra lo cacheado al instante y refresca en background si está stale.
- **Polling de live**: cada 60s a `/api/matches?sport=${sportId}&live=true`.
- Expone `{ matches, loading, liveCount, error }`. El `error` es discriminado por fuente (`flashscore` / `supabase`, con escenarios `fs_down_db_ok`, `both_down`, `fs_cache`, …).

Otros hooks: `useFavorites`, `useUserPreferences` (estos consultan **Supabase directo**, no `/api`).

### 4.3 Supabase desde el navegador

`createBrowserClient` ([src/lib/supabase/client.ts](../src/lib/supabase/client.ts)) — singleton creado con URL + anon key. Se usa para **auth** (`signInWithPassword`, OAuth Google) y algunas queries acotadas (favoritos, preferencias). La sesión se cachea en `localStorage` (`g22_user`) para evitar flickering.

### 4.4 Autenticación de las llamadas

- **Cookies HTTP-only** de sesión Supabase. El navegador las adjunta automáticamente; en mutaciones explícitas se usa `credentials: 'same-origin'`.
- **No** se usan headers `Authorization: Bearer` en las llamadas a `/api`.

> **Regla crítica de auth en mobile** (memoria del proyecto): todos los paths de cookie de auth deben usar el **mismo scope** (`getSupabaseAuthCookieOptions`) — un `Domain` inconsistente (host-only vs apex/www) rompe el login.

---

## 5. Manejo de Timezones (flujo completo)

1. **Front detecta** la TZ: `Intl.DateTimeFormat().resolvedOptions().timeZone` ([useMatchesStore.ts:91](../src/hooks/useMatchesStore.ts#L91)).
2. **Front la envía** como `?tz=` ([useMatchesStore.ts:181](../src/hooks/useMatchesStore.ts#L181)).
3. **Backend** calcula la fecha en la TZ del usuario con `formatDateKey(date, tz)` (`Intl.DateTimeFormat('en-CA', { timeZone })` → `YYYY-MM-DD`) y deriva el `dayOffset` con matemática **timezone-aware**, nunca UTC puro.
4. Para partidos en el borde de medianoche UTC, hace **fetch del día adyacente** (dirección según el offset de la TZ).
5. **FlashScore** recibe `timezone` como query param y la TZ forma parte de la **cache key** (evita contaminación cross-timezone).
6. El backend siempre **almacena/envía UTC** (`.toISOString()`); el formateo a hora local ocurre con `timeZone` explícito.

---

## 6. Tablas de referencia

### Endpoints internos críticos

| Ruta | Método(s) | Auth | Responsabilidad |
|------|-----------|------|-----------------|
| `/api/matches` | GET | Público | Lista de partidos (FlashScore + DB) con cache |
| `/api/matches/[id]` | GET / PATCH / DELETE | Público (GET) · scoped (mut.) | Detalle / editar / borrar partido |
| `/api/matches/[id]/can-edit` | GET | scoped | Devuelve `{ canEdit }` (siempre 200) |
| `/api/teams` | GET | Público | Detalle de equipo externo (ESPN/FlashScore/SofaScore) |
| `/api/clubs` | GET / POST | Público (GET) · scoped (POST) | Listar / crear clubs |
| `/api/clubs/[id]` | GET / PATCH / DELETE | Público (GET) · scoped | Detalle / editar / borrar club |
| `/api/admin/torneo/import` | POST | admin_torneo | Importar torneo desde Excel (interpret/commit) |
| `/api/admin/torneo/matches` | GET / POST | admin_torneo (scoped) | Partidos del gestor |
| `/api/checkout/create` | POST | sesión | Crear preapproval MercadoPago |
| `/api/auth/sync-user` | POST | sesión | Sincronizar perfil tras login (rate-limited) |
| `/api/admin/super/*` | varios | super_admin | Gestión global (rankings, usuarios, …) |
| `/api/club-admin/*` | varios | admin de club | Panel del club |
| `/api/webhooks/mercadopago` | POST | firma MP | Webhook de pagos |

### Funciones por servicio externo (selección)

| Servicio | Función | Endpoint |
|----------|---------|----------|
| FlashScore | `getFlashScoreMatches` | `/matches/list` |
| FlashScore | `getFlashScoreLiveMatches` | `/matches/live` |
| FlashScore | `getFlashScoreMatchDetails` | `/matches/details` |
| FlashScore | `getTeamDetails` | `/teams/details` |
| FlashScore | `getTournamentStandings` | `/tournaments/standings` |
| ESPN | `getEspnFootballMatches` | `/sports/soccer/{liga}/scoreboard` |
| SofaScore | `getSofaScoreFootballMatches` | `/v1/matches?date=&tz=` |
| MercadoPago | `createPreapproval` | `POST /preapprovals` |

---

## 7. Convenciones y pitfalls

- **`apiFetch` nunca lanza** — siempre chequear `data === null`, no envolver en try/catch esperando excepción.
- **Dynamic params son Promises** — `const { id } = await params`.
- **Service-role solo server-side** — nunca exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente; usar anon + RLS por defecto.
- **Cache keys deben incluir la timezone** — si no, partidos de un usuario se "filtran" a otro.
- **Day offset siempre timezone-aware** — nunca calcular con matemática UTC pura.
- **Dedupe de in-flight requests** — los servicios externos reusan la promesa en curso; no asumir una llamada de red por invocación.
- **Frontend cancela en unmount** — usar `AbortController` y chequear `signal.aborted` antes de setear estado.
- **Auth por cookie same-origin** — no agregar `Authorization: Bearer`; mantener un único scope de cookie de auth.
