# Auditoría de fragilidad ante cambios en la DB — G22 Scores

**Fecha:** 2026-07-01 · **Alcance:** solo diagnóstico, ningún archivo modificado.
**Cobertura:** data layer (`src/lib/services`, `src/lib/server`), API routes (`src/app/api`), ingesta externa (ESPN/FlashScore/RapidAPI/SofaScore, imports), capa de render, y migraciones (`supabase/migrations`).

**Resumen:** los archivos centrales (fixtureService, resultsApi, clubRankings, los clientes grandes de match/torneo) están bien endurecidos — fallbacks de columnas, normalización de JSONB, chequeo de errores. La fragilidad real se concentra en: (1) archivos secundarios que no aplican esos mismos patrones, (2) la frontera IDs externos/texto ↔ columnas UUID (la familia del bug que ya tuviste), (3) escrituras multi-paso sin transacción ni idempotencia, y (4) el drift entre migraciones (drop → restore) y los tipos/queries del código.

---

## CRÍTICOS

### C1. Tabla `external_match_cache` dropeada y nunca recreada
- **Archivo:** `supabase/migrations/20260318100000_schema_simplification_core.sql:136` + `src/lib/services/externalMatchCache.ts:177-191`
- **Qué lo rompe:** la tabla se crea en la migración `20260315000001` y se dropea con CASCADE en `20260318100000`; ninguna migración posterior la recrea (verificado). En cualquier entorno provisionado desde la cadena de migraciones, `upsertMatches()` hace `throw error` (42P01) y los crons `live-sync`/`fixture-sync` explotan en cada corrida. Hoy funciona solo porque la DB de producción conserva la tabla vieja.
- **Fix:** migración que recree la tabla, o guard `isMissingTableError` + no-op en el service (como ya hace `prodePlay.ts:917`).

### C2. Outage de ESPN marca todos los partidos live como `final`
- **Archivo:** `src/app/api/cron/live-sync/route.ts:52-73` + `src/lib/services/espnFootball.ts:~1058` (`catch { return [] }` por liga, verificado)
- **Qué lo rompe:** un timeout/429 de ESPN devuelve `[]` sin señal de error → `apiFailed` queda `false` → `resetStaleLiveMatches([], 'football', ...)` marca **todos** los partidos en vivo del caché como finalizados en pleno partido.
- **Fix:** distinguir "error" de "cero partidos" (retornar `null` o lanzar) y no ejecutar el reset cuando la lista vacía provenga de un fallo.

### C3. Recalcular standings: delete-then-insert sin transacción
- **Archivo:** `src/lib/server/recalculateStandings.ts:85-100, 208-238, 316-320`
- **Qué lo rompe:** se borra `tournament_standings` de la fase *antes* de calcular e insertar. Si cualquier paso posterior falla (columna renombrada, error de query, `season_id` no-UUID — ver M2), la tabla de posiciones queda **vacía en producción**. El delete de la línea ~283 además no chequea `error`.
- **Fix:** calcular primero, borrar+insertar al final, idealmente en un RPC transaccional; validar `seasonId` con `assertUuid` al inicio.

### C4. Webhook WhatsApp: `matchId` externo sin validar UUID + estado inválido
- **Archivo:** `src/app/api/integrations/whatsapp/matches/route.ts:139, 253` (matchId) y `:123-134` (normalizeStatus)
- **Qué lo rompe:** (a) un `matchId` no-UUID desde n8n/planilla llega a `.eq('id', matchId)` sobre `matches.id UUID` → 22P02 → 500 con SQL crudo — exactamente tu bug histórico. (b) `normalizeStatus` mapea `'cancelado' → 'cancelled'`, pero el CHECK de `matches.status` (`schema_v2.sql:84`, verificado, nunca alterado) solo admite `scheduled/live/final/postponed/suspended` → 23514 → 500. El fallback `return normalized` además deja pasar cualquier string.
- **Fix:** `isUuid(matchId)` → 400/404 antes de tocar la DB; whitelist estricta contra el CHECK real (y migración si querés soportar `cancelled` — `vote/route.ts` y prode ya lo asumen: hay drift código↔esquema).

### C5. FlashScore: ID aleatorio como PK del upsert de caché
- **Archivo:** `src/lib/services/flashscore.ts:540` (verificado: `id: evt.match_id || evt.event_key || \`fs-${Math.random()}\``)
- **Qué lo rompe:** eventos sin `match_id` reciben un ID no determinístico que se usa como clave de `upsert(..., onConflict: 'id')` en `external_match_cache` → cada corrida horaria crea filas nuevas (duplicados infinitos) y rompe el dedup entre corridas.
- **Fix:** descartar el evento cuando no hay ID estable.

### C6. Checkout: guard de suscripción activa anulado por PGRST116
- **Archivo:** `src/app/api/checkout/create/route.ts:51-64` (+ update sin chequear error en `:130-136`)
- **Qué lo rompe:** `.in('status', ['pending','active']).maybeSingle()` falla con PGRST116 si el usuario tiene 2+ filas; ese código se ignora explícitamente → `existing = null` → se saltea el 409 y se crean pendings duplicadas. Y si el update final de `provider_subscription_id` falla, la preapproval de MercadoPago queda huérfana y el webhook nunca matchea.
- **Fix:** `.limit(2)` + decidir sobre el array (nunca tragarse PGRST116 en billing); chequear `error` del update y compensar.

---

## MEDIOS

### M1. `round_id` TEXT legado comparado contra `tournament_rounds.id` UUID
- **Archivo:** `src/lib/services/matchPointsSync.ts:71-77`, `src/lib/services/matchCenterService.ts:230-236`
- **Qué lo rompe:** `matches.round_id` legado (`'F1'`, `'QF'`) en `.eq('id', match.round_id)` → 22P02, error ignorado → `phaseId` null → se aplican **reglas de puntos default en silencio** (bonus mal calculados, sin log).
- **Fix:** `if (!isUuid(match.round_id)) skip` (el helper ya existe en `src/lib/utils/postgrest.ts`).

### M2. Doble semántica de `season_id` (TEXT `'2026'` vs UUID)
- **Archivo:** `src/lib/server/recalculateStandings.ts:91-93, 224-225`; `src/app/api/tournaments/[id]/participants/route.ts:984`
- **Qué lo rompe:** `tournaments.season_id` es TEXT y `matches/standings.season_id` es UUID FK. Un `seasonId` legado del request → 22P02 (en recalculateStandings, *después* de haber borrado standings — combina con C3).
- **Fix:** `assertUuid(seasonId)` en el borde antes de cualquier delete/insert.

### M3. `entityResolver` consulta la tabla `players`, que no existe
- **Archivo:** `src/lib/services/entityResolver.ts:63, 74, 106` + `src/lib/database.types.ts:~1415`
- **Qué lo rompe:** ninguna migración crea `players` (solo `people`/`squad_members`). Con `type: 'player'` el error es 42P01 → `{kind:'error'}` → 500 en la página de jugador. `database.types.ts` la declara igual: falsa seguridad de tipos.
- **Fix:** mapear 'player' a `people` (o tratar 42P01 como not_found) y regenerar tipos.

### M4. `database.types.ts` desactualizado en ambas direcciones
- **Archivo:** `src/lib/database.types.ts` (Row de `matches` ~1180)
- **Qué lo rompe:** faltan columnas agregadas después (`season_id`, `home_team_id`, `home_season_entry_id`, `effective_date`...) y sobran tablas inexistentes. Todos los casts `as MatchRow` no validan nada; el archivo es anterior a ~15 migraciones.
- **Fix:** regenerar con `supabase gen types typescript` y agregarlo al CI.

### M5. Match center: select fijo de ~40 columnas sin fallback
- **Archivo:** `src/lib/services/matchCenterService.ts:140-190` (`MATCH_CENTER_MATCH_SELECT`) + `:1504-1508`
- **Qué lo rompe:** incluye columnas que ya fueron dropeadas una vez y restauradas (`clock`, `lineups`, `broadcast_url`...). Si se vuelve a tocar cualquiera, todo el match center muestra "no encontrado".
- **Fix:** replicar el patrón de variantes con `isMissingColumnError` que ya usa `fixtureService.selectMatchForUpdate` (fixtureService.ts:161-197).

### M6. `clubService`: columna muerta + "schema healing" por string-matching
- **Archivo:** `src/lib/services/clubService.ts:98-100, 131-166` (y upsert de `unions` sin chequear error en `:122-127`)
- **Qué lo rompe:** el insert siempre incluye `categories` (dropeada en 20260318) y el fallback depende de `error.message.includes('column "categories"')` — si PostgREST cambia el wording, la creación de clubes muere sin fallback.
- **Fix:** usar `isMissingColumnError` y sacar columnas muertas del payload.

### M7. Interpolación sin sanitizar en filtros `.or()` de PostgREST (inyección de filtro)
- **Archivos:** `src/lib/services/divisionService.ts:211, 222`; `src/app/api/clubs/route.ts:226-232` (vía `?sport=`); `src/app/api/tournaments/[id]/participants/route.ts:1268`
- **Qué lo rompe:** `clubs.id` es TEXT/slug y `.or()` no es parametrizado: un valor con `,`/`(`/`)` rompe el parser (500) o inyecta cláusulas OR. En `/api/clubs`, `?sport=foo,status.eq.draft` agrega condiciones arbitrarias.
- **Fix:** whitelist (`/^[a-z0-9-]+$/`, lista de deportes conocidos) antes de interpolar, o reescribir con `.eq()`.

### M8. Sync de fixtures externos sin idempotencia: re-correr duplica todo
- **Archivo:** `src/app/api/tournaments/[id]/external/{espn,flashscore}/sync/route.ts:52-75` + `src/lib/services/fixtureService.ts:1679-1758` (`importMatches`)
- **Qué lo rompe:** INSERT plano sin persistir `external_match_id` ni chequear duplicados: retry/doble click duplica el fixture completo. Chunks de 50 sin transacción → importación parcial sin rollback.
- **Fix:** guardar el ID externo y upsert con clave `(tournament_id, external_match_id)`.

### M9. `apiFetch` nunca lanza: outage indistinguible de "sin datos"
- **Archivo:** `src/lib/apiFetch.ts:76-97`
- **Qué lo rompe:** `!res.ok` y error de red devuelven `{data: null}` igual que un día sin partidos. Causa raíz de C2; además no se cachean fallos → se re-martilla la API en outage. Los timeouts se reportan como 500 (el `AbortError` no matchea).
- **Fix:** exponer el estado de error al caller y cachear negativos con TTL corto.

### M10. Clave RapidAPI en `NEXT_PUBLIC_`
- **Archivo:** `src/lib/services/flashscore.ts:30`
- **Qué lo rompe:** el prefijo hace que Next inline la clave en cualquier bundle cliente que la referencie: un import descuidado publica la clave paga.
- **Fix:** renombrar a `RAPIDAPI_KEY` (server-only) y fail-fast si falta.

### M11. `learnAliases` fosiliza matches difusos incorrectos
- **Archivo:** `src/lib/services/fixtureImportService.ts:276, 291` + `whatsappMatchSync.ts:299` (acepta score ≥ 0.74)
- **Qué lo rompe:** un solo match difuso equivocado queda persistido en `club_aliases` con score 1 y envenena todos los imports futuros hacia el club equivocado.
- **Fix:** aprender aliases solo con resolución manual/confirmada o confianza alta.

### M12. `generate-rounds`: fallas parciales tragadas + `num_rounds` sin cap
- **Archivo:** `src/app/api/tournaments/[id]/phases/[phaseId]/generate-rounds/route.ts:127-130, 154-156, 31, 166`
- **Qué lo rompe:** un insert que falla a mitad del loop deja rondas sin partidos y responde 201; reintentar duplica rondas. `num_rounds: 1000000` crea filas masivas vía RPC.
- **Fix:** acumular errores y responder 500/207; `Number.isInteger` + cap (1-60); RPC transaccional.

### M13. Reemplazo de participante: propagación multi-tabla sin transacción
- **Archivo:** `src/app/api/tournaments/[id]/participants/route.ts:1351-1421`
- **Qué lo rompe:** si `matches` se actualiza pero `tournament_standings` falla (o viceversa), el torneo queda mitad con el club nuevo y mitad con el viejo; responde 500 pero la mutación parcial ya persistió.
- **Fix:** RPC/función SQL transaccional.

### M14. Import histórico: rollback incompleto y re-run duplica temporadas
- **Archivo:** `src/lib/services/historicalTournamentImportService.ts:993-998, 1678-1685` (y `tournamentImport/commit.ts:205-221`: `ensureClub` por slug global fusiona clubes distintos que colisionan en slug)
- **Qué lo rompe:** el rollback solo borra `tournament_seasons`; participantes/fases/matches quedan huérfanos. Retry inserta otra temporada con el mismo `season_code`. `ensureClub` puede colgar partidos del club equivocado.
- **Fix:** chequear `(tournament_id, season_code)` antes de insertar; borrar hijos en el catch; resolver clubes contra catálogo con confirmación.

### M15. POST /api/matches: validación UUID inconsistente en el mismo handler
- **Archivo:** `src/app/api/matches/route.ts:1918-2063` (y `:1976` el cast `(round.tournament_phases as any).tournament_id`)
- **Qué lo rompe:** `roundId` pasa por `isUuidLike` pero `tournamentId`, `phaseId`, `homeSquadId`, `awaySquadId` van crudos a columnas UUID → 22P02 → 500. Si la relación embebida cambia de forma, el match se inserta con `tournament_id: null` (amistoso fantasma).
- **Fix:** aplicar `isUuidLike` a todos los IDs del body → 400; validar la forma del join embebido.

### M16. Fecha inválida tumba toda la app pública (banner global del Prode)
- **Archivo:** `src/components/prode/ProdeWorldCupScreen.tsx:79` (montado vía `ConditionalLayout.tsx:91`, global) + `src/lib/server/prodeWorldCupScreenData.ts:62` (el fallback no filtra fechas inválidas)
- **Qué lo rompe:** `Intl.DateTimeFormat().format(new Date(startsAt))` **lanza RangeError** con fecha inválida (a diferencia de `toLocaleDateString`). Un solo `startsAt` malformado → error boundary raíz en todas las páginas. Mismo patrón sin guard en `ClubCompetitionsPanel.tsx:114-133` y `ClubStandingsOverviewTab.tsx:11-19`.
- **Fix:** validar `Number.isNaN(new Date(x).getTime())` o usar el helper seguro existente `formatDateInTimeZone` (`src/lib/timezone.ts`).

---

## BAJOS

- **B1.** `src/lib/services/standingsEngine.ts:258-270` — `Number(score[0])` sin guard: score no numérico → `NaN` se propaga a points_for/against y desordena la tabla. Fix: `|| 0` (como ya hace `resultsApi.ts:974`).
- **B2.** `src/lib/services/fixtureService.ts:750-806` — `findOrCreateRound` sin unique `(phase_id, name)`: creaciones concurrentes duplican jornadas. Fix: unique index + upsert `onConflict`.
- **B3.** `supabase/migrations/20260425223000` — `tournaments.external_id` se restauró **sin UNIQUE** tras el drop: dedupe por external_id permite duplicados silenciosos. Fix: índice único parcial `WHERE external_id IS NOT NULL`.
- **B4.** `python-service/app/main.py:30-42` — si `SOFASCORE_SERVICE_TOKEN` no está seteado el middleware deja pasar todo con CORS `*`. Fix: fail-fast en arranque.
- **B5.** `src/app/api/prode/private-leagues/route.ts:105-107` — invite codes con `Math.random()` (6 chars base36): enumerables. Fix: `crypto.randomBytes` + rate limit.
- **B6.** Mensajes crudos de Postgres al cliente (~5 rutas confirmadas: `participants:1359`, `groups:122`, `matches:2074`, `matches/[id]:431`, `private-leagues:546`): expone esquema y acopla clientes. Fix: mapear códigos 23505/23503/22P02 a mensajes propios.
- **B7.** `src/lib/validation/` (zod, validateClubCreate/Update) tiene **cero imports desde `src/app/api/`**: la validación vive solo en los forms; curl la esquiva. Fix: invocar los mismos schemas en los handlers.
- **B8.** `src/app/resultados/page.tsx:108-112` — score null en partido `finished` se mapea a `0` → muestra 0-0 real en vez de "-". Fix: mapear a `null`.
- **B9.** `src/app/tablas/page.tsx:8-36` — la página pública renderiza **datos mock hardcodeados**, nunca consulta la DB; selección sin datos → tabla vacía sin empty state. Fix: conectar a standings reales o sacar del nav.
- **B10.** `src/hooks/useMatchesStore.ts:298-304` — API caída → "No hay partidos para esta fecha" en vez de error (`setSourceError` solo se llama `if (ok)`). Fix: setear error en la rama `!ok`.
- **B11.** `src/lib/services/espnFootball.ts:838-852, 1940-1956` — ID sin liga conocida dispara ~70 requests paralelos a ESPN sin cachear el miss: amplificación de tráfico/throttling. Fix: cache negativo por eventId + límite de concurrencia.
- **B12.** `src/lib/services/flashscore.ts:580-604` — heurísticas fuerzan `live`/`final` sin confirmación de la API: un suspendido queda `final` con score parcial y se persiste al caché. Fix: estado "presunto" o excluir del upsert.
- **B13.** `src/lib/server/prodePlay.ts:1190-1305` — select-then-insert de `prode_events` con locks en memoria (inútiles entre instancias serverless): carrera → unique violation tira todo el sync. Fix: `upsert(..., { onConflict })`.
- **B14.** `src/app/tournaments/[id]/TournamentDetailClient.tsx:510-512` — `ts * 1000` asume epoch en segundos; con ISO string da NaN → hero muestra '—' teniendo fecha (silencioso). Fix: detectar tipo.
- **B15.** `src/lib/services/tournamentImporter.ts:53-90` — código hoy muerto que upserta slugs (`'rugby-world-cup'`) en `tournaments.id UUID`: cualquier reactivación revienta con 22P02. Fix: mapear a `external_id` o borrar el módulo.

---

## Patrones sistémicos

1. **Frontera texto/UUID sin validar en los escritores.** El helper correcto (`isUuid`/`assertUuid`, `src/lib/utils/postgrest.ts`) existe y se usa bien en ~11 archivos, pero se aplica de forma inconsistente incluso dentro del mismo handler (C4, M1, M2, M15, B15). Es la familia exacta de tu bug histórico. Regla simple: todo ID que venga de request body, URL o API externa pasa por `isUuid` antes de tocar una columna UUID.

2. **Esquema yo-yo como fuente principal de drift.** La migración `20260318100000` dropeó ~19 tablas y ~30 columnas; le siguieron 8+ migraciones "restore" devolviendo cosas a medida que rompían. El costo: listas de variantes de columnas hardcodeadas (6 en fixtureService, ~10 en fetchTournamentData, 4 en clubRankings), `database.types.ts` obsoleto (M4), y `external_match_cache` que se cayó por la grieta (C1). Regenerar tipos en CI + un smoke test de esquema (¿existen las tablas/columnas que el código selecciona?) atajaría casi todo esto.

3. **Errores tragados → `[]`/`null` indistinguible de "sin datos"** (~15 sitios en ingesta, ~15 destructurings `const { data } =` que descartan `error` en API routes). Consecuencias: C2 (partidos finalizados por outage), 404s falsos, y soporte a ciegas ("no hay datos" cuando en realidad hay error).

4. **Escrituras multi-paso sin transacción ni idempotencia** (~8 flujos: recalculateStandings, importMatches, generate-rounds, participants replace, checkout, imports históricos, commit de torneos, createFromExternal). Retries duplican; fallas intermedias dejan datos huérfanos y a veces responden 2xx. El fix estructural son RPCs transaccionales para las operaciones compuestas.

5. **Matching de entidades externas por nombre/slug** (~6 sitios) sin tabla `provider + external_id → entidad interna` para clubes; `learnAliases` fosiliza los errores (M11, M14). Una tabla de mapeo explícita es el fix estructural.

**Lo positivo:** `fixtureService`, `resultsApi`, `clubRankings`, los transformers del python-service y los 4 clientes grandes de render son notablemente defensivos (fallbacks de columnas, normalización de JSONB, manejo del join embebido objeto/array, error boundaries). El código nuevo debería copiar esos patrones — el problema no es que no sepan hacerlo, es que está aplicado de forma despareja.
