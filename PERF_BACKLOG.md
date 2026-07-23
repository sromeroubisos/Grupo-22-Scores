# PERF_BACKLOG — Flujo de eventos de partido y tiempo real

**Origen:** diagnóstico del flujo de carga de eventos (goles/tries/tarjetas/cambios) y su
actualización en tiempo real. Complementa el informe fechado `AUDITORIA_ERRORES_PERFORMANCE.md`
(2026-05-09) con foco en el path de escritura por evento y el detalle público.
**Última actualización:** 2026-07-23.

Severidad: 🔴 alta · 🟡 media · ⚪ baja.

---

## Aplicado (este pase) — no re-pickear

- **#2 · Poll background del detalle público.** `src/app/matches/[id]/MatchDetailClientPage.tsx`
  (poll con guarda de visibilidad, pausa en background + catch-up al reanudar) +
  `src/app/api/matches/[id]/route.ts` (`s-maxage=15, stale-while-revalidate=30` SOLO para `status==='live'`).
- **#1c · `getMatchScope` slim.** `src/lib/services/fixtureService.ts` (nuevo helper de 7 columnas, sin joins)
  + `src/app/api/admin/matches/[id]/route.ts` (prev/next del PATCH y prev del DELETE). Mata los 2× `select('*')`+3 joins por evento en super-admin.
- **#1b · Gate de standings por status.** `src/lib/server/recalcAffectedPhasesTraced.ts` (recalcula solo si
  `prev.status` o `next.status` ∈ `FINAL_STANDINGS_STATUSES`; fail-safe recalc ante null/unknown). Afecta admin + club-admin.
- **#4 · Guardas UUID (IDs externos → columnas uuid).** Defensa en capas; toda guarda usa `isUuid` de `@/lib/utils/postgrest`. Ningún id no-UUID llega a Postgres.
  - **Capa 1 (sinks):** `fixtureService.ts` (getMatch/getMatchScope→`null`, updateMatch→throw, deleteMatch→`false`) + `matchCenterService.ts` (persist→throw) + `clubRankings.ts` (getMatchSnapshot→`null`).
  - **P3/A4:** `club-admin/matchAccess.ts` (checkClubMatchAccess→`allowed:false`, corta antes del log) + `admin/super/matches/[id]/approval/route.ts` (→400, elimina el leak del error pg en `details`).
  - **Capa 3 (bypasses):** `matches/[id]/route.ts` DELETE + `admin/matches/[id]/route.ts` PATCH/DELETE (→400 `Invalid match id` antes del early-return privilegiado).
  - **Capa 2 (borde):** `resultsApi.ts` schemas `match_id` con `.uuid()` (→400 `invalid_payload`, antes de cualquier query).
- **Guardado por evento (rendimiento).** Sacado el trabajo derivado y el reemplazo destructivo del camino por evento:
  - **Gate de pipeline derivado por status final** en `fixtureService.updateMatch`: advancement + reseed + ranking-sync se saltean si ni `prev` ni `next` es final (`isFinalStandingsStatus`). Un evento en vivo deja de disparar ~6-10 round-trips derivados. (Complementa el gate de standings de #1b.)
  - **Guardado guiado optimista + background** (`MatchCenterClient.saveGuidedEvent`): el composer cierra y muestra éxito al instante; el PATCH corre en cola serializada (`guidedSaveQueueRef`); rollback por-id si falla. Elimina el spinner que duraba más que la aparición del evento.
  - **Diff incremental de eventos** (`buildEventsPatch`) en "Guardar cambios" (`handleSave`) y "Guardar puntos" (`handleSavePoints`): mandan `eventPatch` (solo lo cambiado/borrado) en vez del array completo → 1 upsert + 1 delete en vez de select-all + upsert-all + delete-diff + resolución de plantel sobre todos los eventos.

---

## Pendiente (orden de ataque acordado)

### 1. 🔴 `select('*')` de `getMatch` para el resto de callers
`src/lib/services/fixtureService.ts:705` (`getMatch`) sigue con `select('*')` + 3 joins (arrastra JSONB `events`/`lineups`/`clock`). En este pase solo se acotó super-admin (#1c). Callers pesados restantes: `resultsApi.ts` (varios), `club-admin/matches/[id]/route.ts:118/188`, `tournaments/[id]/matches/[matchId]/route.ts:20/60`, `integrations/whatsapp/matches/route.ts:431`.
- **Dirección:** para usos que solo necesitan scope (recalc/invalidación), reusar `getMatchScope`; para los que necesitan la fila completa, evaluar un select explícito sin joins innecesarios.

### 2. 🔴 N+1 en búsqueda de resultsApi
`src/lib/server/resultsApi.ts:1892` y `:1905` — `Promise.all(rows.map(row => FixtureService.getMatch(row.id)))`: N lecturas de match completo (`select('*')`+joins) por búsqueda.
- **Dirección:** una sola query `.in('id', ids)` con columnas explícitas en vez de fanout por fila.

### 3. 🟡 Unificar tiempo real del detalle público
Hoy hay 3 mecanismos sin unificar: listas (`useMatchesStore`, polling con visibilidad), detalle público (`MatchDetailClientPage.tsx:1296`, polling propio — ya con guarda tras #2) y admin (`MatchCenterClient.tsx`, Supabase Realtime). El detalle no aprovecha Realtime ni el store compartido.
- **Dirección:** suscribir el detalle a Supabase Realtime (como el admin) o consolidarlo sobre el store, reemplazando el poll de 60s.

### 4. 🟡 stale+cron durable de standings
`recalcAffectedPhases` es fire-and-forget (`recalcAffectedPhasesTraced.ts`), y en Vercel la promesa post-respuesta puede congelarse (no garantiza completarse). Solo relevante para la transición a final (post #1b).
- **Dirección:** espejar el patrón de rankings (`stale_from_match_id` + cron `/api/cron/rebuild-stale-rankings`): marcador de fase pendiente + cron `rebuild-stale-standings`. Es infra nueva (columna/mini-tabla + cron).

### 5. ⚪ Derivar "next" en memoria en el path de escritura
En un evento puro no cambian `date`/`phase`/`tournament`, así que el `nextMatch = getMatchScope(...)` post-update (admin route :110) podría derivarse de `prev` + el patch, ahorrando 1 lectura por evento.
- **Dirección:** micro-opt; solo si se busca exprimir el último round-trip. Anotado en #1c como fuera de alcance.

### 6. ⚪ Pollers sin guarda de background
- `src/hooks/useNotifications.ts:98` — 60s, refresca en `focus` pero sin `visibilitychange` → corre en background.
- `src/components/prode/ProdeEventPicksModal.tsx:110` — 20s mientras live, sin guarda de visibilidad.
- **Dirección:** mismo patrón de #2 (pausar con `document.hidden`, catch-up al reanudar).

### 7. ⚪ Consolidar los `UUID_PATTERN` duplicados (deuda de #4)
Tras #4 quedan 2 copias locales del regex UUID que deberían usar el canónico `isUuid` de `@/lib/utils/postgrest`:
- `src/lib/club-admin/matchAccess.ts:7` — `UUID_PATTERN` (se usa solo para `expectedClubId`; el matchId ya migró a `isUuid`).
- `src/lib/services/matchCenterService.ts:151` — `UUID_PATTERN` (usado por `normalizeEventId`).
- **Dirección:** reemplazar los usos por `isUuid`/`UUID_REGEX` de postgrest.ts y borrar las constantes locales. Cuidado: verificar que la semántica del regex coincida (postgrest.ts exige versión `[1-5]` y variante `[89ab]`) antes de intercambiar en `normalizeEventId`.

### 8. 🟡 Advisors de Supabase pendientes (bloqueado)
No se pudieron correr `get_advisors` (performance/security) en vivo: el MCP de Supabase está conectado pero **sin token** (`Unauthorized`). Los índices de las queries calientes se verificaron por migraciones (existen), pero falta confirmación en vivo + index bloat / unused indexes.
- **Desbloqueo:** setear `SUPABASE_ACCESS_TOKEN` y correr `get_advisors` (performance) y una revisión de índices.

### 9. 🟡 Guardado de alineaciones = N+1 por-jugador (infrecuente, pero pesado)
Guardar alineaciones (`handleSave` con `lineupsDirty`) corre `resolvePersistedLineups` → `ensurePlayerInContext` por jugador → `ensureClubPlayerRole` (`matchCenterService.ts:1054`) + `ensureSquadMember` (`:1149`), cada uno con read + write **por jugador** (~150 round-trips para 46 jugadores), + **refetch completo** post-guardado (el `compactResponse` se cae con lineups dirty). Es código crítico de creación de personas/roles/plantel y una acción **infrecuente** (armado pre-partido), por eso se difirió tras el análisis.
- **Esquema (verificado en migraciones):** `squad_members` tiene `UNIQUE(division_id, person_id)` → batch `upsert(onConflict)` limpio. `club_person_roles` tiene `UNIQUE(club_id, person_id, division_id, role)` **pero** `ensureClubPlayerRole` reasigna la división de un rol existente (`:1076-1122`), así que un upsert batch por esa clave **crearía roles duplicados** (uno por división) → NO es un upsert simple.
- **Dirección (riesgo creciente):** *A1 (seguro):* batch de `squad_members` + `people` nuevas, dejando `club_person_roles` por-jugador (~40-50% menos round-trips). *A2 (más riesgo):* replicar la reasignación de división en memoria y batchear también roles. En ambos, evaluar devolver los lineups resueltos en la respuesta compacta para saltear el refetch. **Requiere tests antes de tocar** (creación de jugadores).
