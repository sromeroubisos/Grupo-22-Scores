# Auditoría de errores, crashes y performance — Grupo-22-Scores

**Proyecto:** Next.js 16.1.6 + React 19.2 + Supabase + TypeScript 5
**Fecha del informe:** 2026-05-09
**Alcance:** queries de Supabase/DB, errores TypeScript / build, performance frontend, crashes runtime
**Tamaño del código:** 314 archivos `.tsx` + 412 archivos `.ts` en `src/`. Algunos archivos > 4000 líneas.

---

## Resumen ejecutivo

El proyecto tiene una base sólida (App Router, RSC disponible, headers de cache razonables, `optimizePackageImports` configurado), pero arrastra deuda técnica que ya está degradando performance y abrirá crashes en producción. Los problemas se concentran en cinco frentes:

1. **Queries Supabase con N+1 y `select('*')`** sin paginación en endpoints de listado y servicios de import — son los candidatos #1 a timeouts y OOM.
2. **TypeScript con `strict: false` y `noImplicitAny: false`** combinado con `ignoreBuildErrors: false`: oculta bugs en desarrollo pero rompe build cuando alguien toca un archivo afectado. Ya hay 13 errores activos en `src/lib/server/phaseLabels.ts` y errores en API routes.
3. **Componentes cliente gigantes** (`ExportImage.tsx` ≈ 16K líneas, `MatchCenterClient.tsx` ≈ 4.8K, `TournamentDetailClient.tsx` ≈ 4.2K, `app/page.tsx` ≈ 2.4K). El home (`/`) es 100% client component y ralentiza TTI.
4. **`useEffect` sin cleanup, `setInterval`/`setTimeout` sin clear, fetches en cliente sin SWR** pese a que SWR ya está instalado.
5. **Manejo de errores ausente**: queries Supabase ignoran `error`, `request.json()` sin try/catch en varias API routes, `.single()` en lugar de `.maybeSingle()`, promesas sin `.catch()`.

A continuación se detallan hallazgos por área, cada uno con archivo, línea, descripción, impacto y fix sugerido. Los items marcados **🔴 CRÍTICO** afectan al build o pueden tumbar el servidor; **🟠 ALTO** generan latencia o crashes intermitentes; **🟡 MEDIO** afectan UX/perf pero no rompen.

---

## 1. Queries Supabase / DB

### 1.1 🔴 N+1 en copia de temporadas

**Archivo:** `src/lib/services/tournamentSeasonService.ts:323-357`

```ts
await Promise.all((insertedEntries ?? []).map(async (entry: any) => {
  const { data: club } = await db
    .from('clubs')
    .select('name, short_name')
    .eq('id', entry.club_id)
    .maybeSingle();
  // ...insert tournament_participant
}));
```

**Problema:** una query a `clubs` por cada entrada insertada. 200 clubs = 200 queries.
**Impacto:** copiar una temporada de un torneo grande puede tardar 30+ s y devolver timeout en Vercel (límite 30 s).
**Fix:** batch con `.in('id', clubIds)` antes del `Promise.all` y luego `Map.get(clubId)` por entry.

### 1.2 🔴 N+1 en derivación de slugs únicos

**Archivo:** `src/lib/services/tournamentClubDerivationService.ts:402-411`

```ts
for (let attempt = 0; attempt < 24; attempt += 1) {
  const { data: existingClub } = await supabase
    .from('clubs').select('id').eq('id', candidate).maybeSingle();
  if (!existingClub) return candidate;
  candidate = `${normalizedBase}-${attempt + 2}`;
}
```

**Problema:** hasta 24 round-trips secuenciales para encontrar un slug libre, con risk de race condition si dos requests entran a la vez.
**Fix:** mover la unicidad a la DB (`UNIQUE` constraint + `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id`) o trigger Postgres.

### 1.3 🟠 `select('*')` sin paginar en rankings

**Archivo:** `src/lib/server/clubRankings.ts:730-735`

```ts
const { data, error } = await supabase
  .from('club_ranking_entries')
  .select('*')
  .eq('ranking_id', rankingId)
  .order('current_position', { ascending: true, nullsFirst: false })
  .order('current_rating', { ascending: false });
```

**Problema:** sin `.limit()`. Un ranking grande (>50K) carga todo en memoria del proceso Node.
**Impacto:** OOM y tiempos > 3 s. Además, dos `.order()` encadenados sobre columnas no indexadas hacen sort en server PG.
**Fix:** añadir `.range(offset, offset + 999)`, seleccionar solo columnas necesarias (`id, club_id, current_rating, current_position`), e índice compuesto:

```sql
CREATE INDEX idx_ranking_entries_pos_rating
  ON club_ranking_entries(ranking_id, current_position NULLS LAST, current_rating DESC);
```

### 1.4 🟠 4 queries secuenciales en `loadClubFamily`

**Archivo:** `src/lib/services/tournamentClubDerivationService.ts:420-469`

Cuatro `await supabase.from(...)` en serie (`clubs`, `club_derivatives` x2, `clubs` por categoría). Tres son independientes y se pueden paralelizar.
**Impacto:** ~4 × RTT = ~600 ms por carga de pantalla.
**Fix:**

```ts
const [incoming, outgoing, categoryClubs] = await Promise.all([
  supabase.from('club_derivatives')...,
  supabase.from('club_derivatives')...,
  supabase.from('clubs')...,
]);
```

### 1.5 🟠 `select('*')` en `tournament_participants` y similares

**Archivo:** `src/app/api/tournaments/[id]/participants/route.ts:26+`

Endpoint público que devuelve participantes sin `.limit()` ni `.range()`. Si un torneo tiene 10K participantes, el response cuelga.
**Fix:** paginar y devolver solo `id, club_id, division_id, name, logo_url`. Mover lo demás a un endpoint de detalle.

### 1.6 🟡 `select('*')` en `roster_memberships`

**Archivo:** `src/lib/services/tournamentSeasonService.ts:406-409`

`roster_memberships` tiene muchas columnas heredadas. Usa solo las necesarias para la copia: `roster_id, player_id, jersey_number, position, role, status`.

### 1.7 🟡 Imports históricos sin acotar columnas

**Archivos:** `src/lib/services/historicalTournamentImportService.ts` (1944 líneas) y `src/lib/server/resultsApi.ts` (2141 líneas).
Auditar todos los `select('*')` y reemplazar por listas explícitas. Estos servicios corren en background pero llenan logs de Supabase con queries anchas.

### 1.8 ✅ Buen patrón a replicar

**Archivo:** `src/app/api/admin/super/dashboard-stats/route.ts:29-54`

```ts
.select('id', { count: 'exact', head: true })
```

Es la forma correcta de contar sin transferir filas. Replicar este patrón en todos los endpoints de "totales" del dashboard y panel de admin.

---

## 2. TypeScript / build

### 2.1 🔴 Configuración general peligrosa

**Archivo:** `tsconfig.json`

```json
"strict": false,
"noImplicitAny": false
```

Mezcla mortal con `next.config.ts > typescript.ignoreBuildErrors: false`: el build no falla por `any` implícito, pero sí por mismatches de tipo. El equipo "no ve" errores hasta que algo realmente choca.
**Fix:** activar `strict: true` por etapas (empezar por `strictNullChecks: true` y `noImplicitAny: true`), arreglar los archivos críticos uno por uno.

### 2.2 🔴 `src/lib/server/phaseLabels.ts` — 13 errores activos

`tsc_errors.txt` (UTF-16) muestra que este archivo asume tablas/columnas que ya no existen en `database.types.ts`:

- Llamadas a `.from('ui_labels')` — la tabla no está tipada (¿fue renombrada/eliminada?).
- Accesos a `.id`, `.color`, `.name` sobre uniones de tipos donde algunos no tienen esas propiedades.
- Type predicate roto (`is GroupLabel`) por propiedad `id` opcional vs requerida.

**Fix:**

1. Regenerar tipos: `npm run gen:db-types` (script ya está en `package.json`).
2. Si `ui_labels` ya no existe: borrar el archivo o mover las queries al nombre nuevo.
3. Si todavía existe: añadir migración para que el script las incluya.

### 2.3 🔴 `src/app/api/admin/super/matches/route.ts` — 3 errores

Líneas 214, 255, 272: el query builder de Supabase devuelve `PostgrestFilterBuilder<…, GenericStringError[]>` cuando se asigna a una variable tipada como `Promise<{ data: MatchConsoleRow[] }>`. Indica que el `.select('foo,bar')` está mal escrito (con un nombre de columna inválido) y PostgREST devolvería un error de string en producción, **no datos**.
**Fix:** revisar los `select(...)` de las líneas mencionadas; probablemente hay un alias o columna que ya no existe (similar a `ui_labels`).

### 2.4 🔴 `src/app/api/search/universal/route.ts:91, 109`

`type: string` mapeado a un literal `"tournament" | "club"`. Línea 91 también hace `as TournamentSearchRow[]` sobre un shape con `sport: { name }[]` (array) cuando el tipo espera objeto. **El endpoint puede devolver crashes en producción** si una row no entra en el cast.
**Fix:** narrow del `type` con `const type = ... as 'tournament' | 'club'` validado, y `sport: row.sport?.[0] ?? null`.

### 2.5 🟠 `src/app/api/admin/system/import-tournaments/route.ts:113`

`priority: number | null` no entra en el insert (espera `number | undefined`). En Supabase esto es la diferencia entre "respeta el default" y "fuerza null". Reemplazar `null` por `undefined` o usar `priority: priority ?? undefined`.

### 2.6 🟠 `src/app/admin/entities/new/page.tsx:127`

`club_id: null` no entra en `PlayerData`. Cambiar por `club_id: undefined` o ajustar el tipo si la intención es "explícitamente sin club".

### 2.7 🟠 `src/app/tournaments/[id]/TournamentDetailClient.tsx:654`

`'meta' is possibly null`. Acceso directo sin `?.`. Si Supabase devuelve un torneo sin metadatos, la página crashea con `Cannot read property … of null`.

### 2.8 🟡 Casts `as any` y `as unknown as Foo`

Hay decenas de `as any` para silenciar tipos en archivos que tocan Supabase. Cada uno es una bomba latente: si la columna se renombra, el cast sigue compilando pero el runtime falla. Tras regenerar tipos (2.2), eliminar progresivamente con `as Database['public']['Tables']['xxx']['Row']`.

---

## 3. Performance frontend Next.js

### 3.1 🔴 Home `app/page.tsx` 100% client (2.4K líneas)

Línea 1 contiene `'use client'`. Toda la página de inicio se hidrata en cliente con 14+ `useState` y ~20 `useMemo/useCallback`.
**Impacto:** TTI > 3 s, FCP lento, bloquea concurrent rendering. Es justo la página que más debería usar RSC streaming.
**Fix:** convertir `app/page.tsx` en server component que hace los fetches iniciales (torneos por deporte, internacionales, noticias), y mover la parte interactiva (filtros, favoritos) a un `<HomeInteractive />` chico marcado `'use client'`.

### 3.2 🔴 `ExportImage.tsx` — 16.254 líneas en un solo archivo

Componente monolítico de Canvas/exportación de imágenes. IDE lag, refactor imposible, no tree-shakeable, full bundle.
**Fix:** dividir en `canvas-utils.ts`, `poster-builders.ts`, `logo-handlers.ts`, `export-templates/*.ts`. Lazy-load con `dynamic(() => import('@/components/ExportImage'), { ssr: false })` solo cuando se abre el modal de exportación.

### 3.3 🔴 Imports pesados a top-level

**Archivo:** `src/app/admin/components/PhaseCreator.tsx:37-38`

```ts
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
```

Ambos pesan cientos de KB. En componente cliente esto entra en el bundle de la ruta admin entera.
**Fix:**

```ts
const XLSX = (await import('xlsx')).default;
const pdfjsLib = await import('pdfjs-dist');
```

dentro del handler que los necesita.

### 3.4 🟠 `setInterval` / `setTimeout` sin cleanup

**Archivo:** `src/app/admin/super/partidos/[id]/MatchCenterClient.tsx:2226` (interval), líneas 2170, 2190, 2477, 3066 (timeouts para feedback).

Sin `clearInterval` / `clearTimeout` en cleanup del `useEffect`. Si el usuario navega antes, los callbacks intentan `setState` sobre un componente desmontado → warning de React + memory leak.
**Fix:** capturar el `id` en `useRef` y limpiar:

```ts
useEffect(() => {
  const id = window.setInterval(...);
  return () => window.clearInterval(id);
}, []);
```

Para los toasts, crear un hook `useFeedbackMessage()` que centralice timeouts.

### 3.5 🟠 `useEffect` con fetches sin SWR ni `AbortController`

Patrón generalizado en `MatchCenterClient`, `TournamentDetailClient`, `app/page.tsx` (líneas 1419-1468):

```ts
useEffect(() => {
  fetch('/api/...').then(r => r.json()).then(setState);
}, []);
```

Sin cleanup ni dedupe. SWR está instalado (`"swr": "^2.4.1"`) pero subutilizado.
**Fix:** migrar progresivamente a `useSWR('/api/...', fetcher)`. Donde se mantenga `fetch` directo, añadir `AbortController` y `isMounted`.

### 3.6 🟠 `<img>` plano en lugar de `<Image>` de Next

20+ instancias en `MatchCenterClient`, `rankings/page.tsx`, etc.
**Impacto:** sin lazy loading, sin srcset, sin negociación AVIF/WebP. LCP penalizado en home y rankings.
**Fix:** reemplazar por `next/image` con `sizes` prop. Para logos en CDN externo, ya están permitidos (`flashscore.com`, `espncdn.com`) en `next.config.ts`.

### 3.7 🟠 Cascada de `useMemo` en `app/page.tsx:979-1023`

`filteredInternational` → `filteredGroups` → `matchesByLeague` → `favoriteClubMatches`. Cada uno depende del anterior.
**Impacto:** O(n²) en arrays grandes; cualquier cambio reactivo dispara la cadena entera.
**Fix:** consolidar en un solo `useMemo` con un único pase (filter + groupBy con `Map`).

### 3.8 🟡 Context `AdminConsoleProvider` sin split

Provee `errors`, `loading`, y `refetch` juntos. Cualquier cambio en `loading` redibuja toda la consola admin.
**Fix:** dividir en dos contextos (datos vs acciones) o usar `useDeferredValue` en hijos pesados.

### 3.9 🟡 Re-renders en `MatchCenterClient` por inmutación profunda

Línea 568 `MatchDetailClientPage.tsx` y similares: `setState(prev => ({ ...prev, …}))` con 6+ propiedades anidadas (`matchData`, `eventsData`, `statsData`, `playerStats`, `commentaryData`, `issues`, `debug`).
**Fix:** separar en 3-4 `useState` independientes o `useReducer` con acciones tipadas. Reduce GC pressure en cada keystroke.

### 3.10 🟡 Página `admin/super/rankings/page.tsx` (1965 líneas) marcada client

Genera tabla gigante con recursión de grupos. No hay streaming, todo se renderiza tras hidratar.
**Fix:** server component + `<Suspense>` por grupo de ranking.

---

## 4. Crashes / runtime / manejo de errores

### 4.1 🔴 `.map()` sobre `data` posiblemente null tras query

**Archivo típico:** `src/app/api/catalog/players/route.ts:23`

```ts
const { data, error } = await query;
if (error) { return ... }
const results = data.map(p => ({ ... })); // data puede seguir siendo null
```

**Fix:** `const results = (data ?? []).map(...)` y/o `if (!data) return NextResponse.json([])`.

### 4.2 🔴 `.single()` que tira excepción cuando 0 filas

**Archivo:** `src/app/api/clubs/[id]/publish/route.ts:36-37` (entre otros).
`.single()` lanza si la query devuelve 0 o 2+ filas. Devuelve 500 sin contexto.
**Fix:** usar `.maybeSingle()` y manejar `data === null` como 404 explícito.

### 4.3 🔴 `request.json()` sin try/catch

Patrón repetido en API routes. JSON malformado genera error no atrapado → 500 silencioso.
**Fix:** envolver:

```ts
let body: unknown;
try { body = await request.json(); }
catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
```

O usar `await request.json().catch(() => null)` y validar después con Zod (ya está en `package.json`).

### 4.4 🔴 Falta de validación con Zod en API routes públicas

Zod 4.3.6 está instalado pero apenas se usa. Cada POST/PUT debería tener un `schema.safeParse(body)` para evitar inserts con shapes raros que rompen la DB.

### 4.5 🟠 `useUser.ts:22` — fetch sin catch

```ts
await fetch('/api/auth/sync-user', { method: 'POST' })
```

Sin `try/catch` ni `.catch()`. Si el endpoint falla, queda como `unhandledrejection` en consola y rompe el flujo de login en algunos navegadores.

### 4.6 🟠 `Promise.allSettled` con resultado parcialmente checkeado

`src/app/api/cron/fixture-sync/route.ts:66, 79-80, 88`: el `Promise.allSettled` está bien, pero el `try/catch` interno (línea 88) traga errores sin propagarlos al resultado del cron job. Si un upsert falla, el cron reporta éxito.
**Fix:** acumular errores en un array y devolverlos en el JSON response del cron.

### 4.7 🟠 `getAge()` sobre fecha inválida

**Archivo:** `src/components/admin/entities/squad/AvailablePlayersColumn.tsx:36`

```ts
return new Date().getFullYear() - new Date(birthDate).getFullYear();
```

Si `birthDate` no es ISO válido, devuelve `NaN`. Luego `NaN` se muestra en UI o se compara mal en filtros.
**Fix:**

```ts
const d = new Date(birthDate);
if (Number.isNaN(d.getTime())) return null;
```

### 4.8 🟠 `firstRow.team?.name || firstRow.participant?.name || …` sin verificar `firstRow`

**Archivo:** `src/components/TournamentLeader.tsx:34`. Si el array está vacío y `firstRow` es undefined, optional chaining no salva la siguiente expresión.
**Fix:** `if (!rows.length) return null;` antes.

### 4.9 🟠 Hidratación: timestamps SSR vs client

`new Date().toISOString()` y `toLocaleDateString()` se renderizan diferente entre server y client por timezone.
**Patrón:** componentes públicos que muestran fechas (`MatchCard`, `NewsItem`).
**Fix:** usar `<time suppressHydrationWarning>` o formatear sólo en cliente con `useEffect` + estado.

### 4.10 🟠 `admin.storage.getPublicUrl()` sin validar `data.publicUrl`

**Archivo:** `src/app/api/club-admin/documents/upload/route.ts:60`. Si el bucket no existe o cambian permisos, `data.publicUrl` puede ser `undefined` y se devuelve al cliente como `fileUrl: undefined`.

### 4.11 🟡 `Sidebar.tsx:42-54` — `getTournamentsBySport` puede devolver null

Llamado dentro de `useMemo` y luego encadenado con `.filter()`. Si la función retorna null en lugar de `[]`, todo el sidebar crashea.
**Fix:** asegurar que el helper siempre devuelva array vacío.

### 4.12 🟡 Logs `console.error` activos en producción

Búsqueda inicial muestra `console.error` y `console.warn` activos en código cliente. En producción no son críticos pero ensucian DevTools del usuario y leakean detalles de schema.
**Fix:** envolver con un wrapper `logger` y deshabilitar en `NODE_ENV === 'production'` o enviar a Sentry.

---

## 5. Plan de remediación recomendado

### Sprint 1 — Build estable (1-2 días)

1. `npm run gen:db-types` para regenerar `database.types.ts`.
2. Arreglar los 13 errores de `phaseLabels.ts` (puede ser que la tabla `ui_labels` se haya renombrado).
3. Arreglar los 5 errores en `api/admin/super/matches/route.ts`, `api/search/universal/route.ts`, `import-tournaments/route.ts`, `entities/new/page.tsx`, `TournamentDetailClient.tsx:654`.
4. Verificar `npm run build` limpio.

### Sprint 2 — Queries pesadas (2-3 días)

1. Reemplazar los dos N+1 críticos (1.1 y 1.2).
2. Añadir `.limit()` y selección explícita en los 4 endpoints de listado más usados (rankings, participants, matches, players).
3. Crear el índice compuesto en `club_ranking_entries`.
4. Paralelizar `loadClubFamily` (1.4).
5. Auditar y reemplazar `select('*')` en `historicalTournamentImportService.ts` y `resultsApi.ts`.

### Sprint 3 — Crashes runtime (2 días)

1. Wrapper `safeJson(req)` y aplicarlo en todas las API routes.
2. Reemplazar `.single()` por `.maybeSingle()` en TODOS los endpoints públicos.
3. Validación Zod en POST/PUT públicos.
4. Cleanup en todos los `setInterval`/`setTimeout` de `MatchCenterClient`.
5. Wrapper `logger` que no pase `console.*` en prod.

### Sprint 4 — Performance frontend (3-4 días)

1. Convertir `app/page.tsx` a server component + `<HomeInteractive />` cliente.
2. Refactor `ExportImage.tsx` (16K líneas) en módulos + dynamic import.
3. Lazy-load `xlsx` y `pdfjs-dist` (3.3).
4. Migrar fetches en cliente a SWR.
5. Reemplazar `<img>` por `next/image`.

### Sprint 5 — Higiene (continuo)

1. Activar `strictNullChecks` y `noImplicitAny`, arreglar uno por uno.
2. Eliminar `as any` tras tener tipos buenos.
3. Reactivar `eslint` strict en los 33 archivos con `eslint-disable`.
4. Mover monitoreo a Sentry/PostHog para capturar lo que se escape.

---

## Anexo: archivos a tener en el radar (orden de impacto)

| Archivo | Líneas | Razón |
|---|---|---|
| `src/components/ExportImage.tsx` | 16 254 | Refactor obligatorio, dynamic import |
| `src/app/admin/super/partidos/[id]/MatchCenterClient.tsx` | 4 819 | Memory leaks (intervals/timeouts), 56 useCallback |
| `src/app/club-admin/matches/[id]/ClubMatchWorkspace.tsx` | 4 342 | Cliente gigante |
| `src/app/tournaments/[id]/TournamentDetailClient.tsx` | 4 251 | Crash potencial línea 654 |
| `src/components/admin/entities/club/ClubPerformanceTab.tsx` | 3 945 | Cliente gigante |
| `src/app/page.tsx` | 2 395 | Home 100% client → mover a RSC |
| `src/lib/server/clubRankings.ts` | 2 380 | Queries sin paginar |
| `src/lib/server/resultsApi.ts` | 2 141 | `select('*')` |
| `src/app/api/matches/route.ts` | 2 068 | API route enorme — dividir |
| `src/app/admin/super/rankings/page.tsx` | 1 965 | Client + tabla recursiva |
| `src/lib/services/historicalTournamentImportService.ts` | 1 944 | Imports con `select('*')` |
| `src/lib/server/phaseLabels.ts` | — | 13 errores TS activos, build-breaking |

---

*Generado a partir de análisis estático del código fuente. Recomendado complementar con: profiling de DB en Supabase Studio (Top Queries), Lighthouse en home y página de match, y un job periódico de `npx tsc --noEmit` en CI.*
