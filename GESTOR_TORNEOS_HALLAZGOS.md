# Gestor de Torneos — Hallazgos fuera de scope (log)

Cosas detectadas durante Fase 3 que NO se tocan en esta línea de trabajo. Anotadas para no perderlas.

---

## H1. Sitios secundarios de invalidación del cache de familia de temporadas
**Estado:** anotado, NO tocado (decisión del usuario). El TTL de 60 s los cubre.
**Contexto:** P1-1 agregó `invalidateSeasonFamilyCache()` en el choke point principal (`POST /api/tournaments/[id]/seasons` — create + copy). Hay otros sitios que mutan `tournament_seasons` / `tournament_relations` y que idealmente también deberían invalidar:

- `src/lib/services/historicalTournamentImportService.ts` — inserta `tournament_seasons` directo (no pasa por `tournamentSeasonService`).
- `src/app/api/tournament-seasons/[seasonId]/*` — edits/rosters/entries de una temporada existente (status, nombre, etc.).
- Escrituras de aristas `previous_season` en `tournament_relations` (`upsertPreviousSeasonEdge`, `ensureChronologicalSeasonEdgesForCluster`).

**Riesgo real:** bajo. Como el cache es in-memory por instancia y la invalidación explícita solo alcanza la instancia actual, ya dependemos del TTL (60 s) para consistencia cross-instancia. Estos sitios simplemente caen en la misma ventana de ≤60 s. Si se quiere invalidación inmediata, agregar el mismo call en cada uno.

---

## H2. `:root` en `.module.css` bloquea el build webpack (y el bundle-analyzer)
**Estado:** anotado. Ver `GESTOR_TORNEOS_BASELINE.md`.
4 archivos `.module.css` definen variables en `:root`, que el css-loader de webpack rechaza en pure-mode (Turbopack lo tolera). Se resuelve gratis cuando la remediación de CSS mueva esos `:root` a un tokens global único.

---

## H3. `NEXT_PUBLIC_RAPIDAPI_KEY` expuesta en el bundle cliente
**Estado:** TICKET propio, prioridad ALTA. Ver `TICKET-rapidapi-key-exposed.md`.

---

## H5. `database.types.ts` desactualizado — falta `current_season_id` (y más)
**Estado:** anotado (= M4 de `AUDITORIA_FRAGILIDAD_DB.md`). Prioridad media.
Los tipos generados no incluyen `tournaments.current_season_id` (verificado: `grep current_season_id database.types.ts` = 0 resultados), pese a que la columna existe y se usa en varios routes. P1-4 metió un cast puntual `(data as { current_season_id?: string | null })` por esto. **Fix:** correr `npm run gen:db-types` (script ya existe: `supabase gen types typescript ... > src/lib/database.types.ts`) y agregarlo al CI. El cast de P1-4 (y otros `as` similares en el repo) **se puede borrar gratis** cuando los tipos estén al día.

---

## H6. `groups` no scopea por season — inconsistente con participants/phases
**Estado:** abierto, requiere verificación en prod antes de resolver.
`loadGroups` (y el route `/groups`) hoy NO filtran por `current_season_id`, mientras que participants/phases/phase-participants SÍ. En torneos multi-temporada, la lista de grupos del tab de Participantes puede mostrar grupos de otras temporadas. **P1-4 (Opción 2) dejó groups como está a propósito**: aplicar el filtro por season puede **esconder grupos con `season_id` NULL o de temporadas previas** → pantalla vacía donde antes había datos. No se pudo verificar la data (MCP Supabase sin token en el entorno).

**Query para verificar en prod** (si da `hidden_after_filter = 0` y `null_season_groups = 0`, es seguro scopear groups = Opción 1):
```sql
SELECT count(*) FILTER (WHERE g.season_id IS DISTINCT FROM t.current_season_id) AS hidden_after_filter,
       count(*) FILTER (WHERE g.season_id IS NULL)                              AS null_season_groups,
       count(*)                                                                 AS total_groups
FROM tournament_groups g
JOIN tournament_phases p ON p.id = g.phase_id
JOIN tournaments t ON t.id = p.tournament_id;
```
**Si hay grupos NULL/previos:** o se hace el route de groups tolerante a NULL (`.or('season_id.eq.<id>,season_id.is.null')`, guardado con `isUuid`), o se backfillea `season_id` en `tournament_groups`, antes de scopear.

---

## H7. Shell context split (P1-C) — DIFERIDO, diseño completo resuelto
**Estado:** diferido a pedido del usuario. Diseño listo para ejecutar en una sesión.
**Problema:** `TournamentDirtyCtx` (`TournamentContext.tsx`) re-renderiza TODO el chrome (Tabs + Shell) en cada tecleo, porque los editores renderizan **reactivo desde `drafts`** (`getSectionDraft` en el render, ej. `TournamentDetailsTab.tsx:144` `const form = getSectionDraft('details') ?? initialForm`) y el chrome comparte el mismo context. B ya mató el costo concreto (localStorage sync por tecleo); C es el re-render del chrome, más liviano → por eso se difirió.

**Importadores (verificado):** 6 archivos, TODOS del módulo (nada externo): TournamentContext (def) + Tabs, Shell, Structure, Format, Details.

**Corte correcto (NO por campo — 4/5 consumidores necesitan ambos lados):**
- `DraftDataCtx` = `{ drafts, getSectionDraft, setSectionDraft }` — REACTIVO. Lo consumen los **editores** (re-renderizan al tipear = correcto, es su input controlado).
- `SignalCtx` = `{ tournamentId, isDirty, dirtySections, recentlySavedSections, setDirty, markSectionDirty, hasDirtySection, hasRecentlySavedSection, triggerSectionSavedFlash, clearSectionDraft, clearAllDrafts, flushDraftPersistence, getDrafts }` — cambia solo con flags dirty/saved. Lo consume el **chrome (Tabs, Shell)**.
- Editores consumen ambos; chrome solo Signal.

**Requisitos críticos (sin esto el split NO sirve):**
1. **`markSectionDirty` IDEMPOTENTE** — bail si el valor no cambió, si no `dirtySections` churnea por tecleo y SignalCtx cambia igual:
   ```ts
   setDirtySections(cur => Boolean(cur[section]) === value ? cur : ({ ...cur, [section]: value }));
   ```
2. **`getDrafts()` por ref** — `draftsRef` sincronizado en cada render (`useEffect(() => { draftsRef.current = drafts; })` sin deps); `getDrafts = useCallback(() => draftsRef.current, [])`. `handleSave` del Shell llama `getDrafts()` en vez de leer `drafts` del context → no se suscribe a DraftData → no re-renderiza al tipear. Sin camino stale: `handleSave` es user-triggered, corre tras el flush de render+efectos.

**Archivos a tocar (6):** TournamentContext (partir en 2 providers + hooks `useTournamentDraft`/`useTournamentSignal`), Tabs (Signal), Shell (Signal + getDrafts), Details/Format/Structure (DraftData + Signal).

---

## H4. `matchesTruncated` en el payload de fixture — PENDIENTE de UI (no es flag muerto)
**Estado:** flag emitido por el backend (P1-3a), todavía **NO consumido por ninguna UI**.
`getTournamentFixture` ahora devuelve `matchesTruncated: true` cuando el fixture supera `FIXTURE_MATCH_CAP` (1000) — devuelve los primeros 1000 + `console.warn`. **Falta la parte de UI**: `TournamentOperationFixtureWorkspace` debe leer `fixture.matchesTruncated` y **avisar al usuario** ("Mostrando los primeros 1000 partidos — hay más; refiná por fase/jornada") con paginación o carga incremental. Sin esa UI el corte no es silencioso a nivel log/tipos, pero **sí lo es para el usuario final** → hay que cerrarlo. Trabajo de UI, se hace cuando toque el workspace (P1-3b o el rediseño del tab).

---

## H8. `next build` global rojo por WIP sin trackear en `src/features/career/`
**Estado:** anotado, NO tocado (fuera de scope, WIP de otro frente). Detectado al correr el build tras aplicar Fase 1b (Operación).

`next build` falla en el type-check con **48 errores TS2353** en `src/features/career/data/events/*.ts` (`injuries`, `media`, `national-team`, `personal`, `tactical`): las properties `stamina`/`mental`/`vision`/`power`/`technique`/`speed`/`kick`/`tackle` no existen en el tipo `Effect`. Es el **motor del simulador de carrera de rugby** (sección Juegos), **WIP sin trackear** (`?? src/features/career/`, nunca commiteado ni type-chequeado) y **huérfano** (`grep -r features/career src/` = 0 imports; nada lo cablea todavía). Rompe el type-check solo porque tsconfig incluye todos los `.ts`.

**NO es regresión de Fase 1b:**
- No hay path de import entre el árbol de torneos y `src/features/career/`.
- Los errores son de data del engine de carrera, no de UI del gestor.
- El "compilando verde" de líneas de trabajo previas es anterior a que este WIP apareciera en el árbol local.

**El gate de verde de un ítem de este trabajo ≠ `next build` global.** El gate es:
1. Turbopack `Compiled successfully` (bundling),
2. `tsc --noEmit` con **0 errores en el árbol de torneos** (`src/components/admin/entities/tournament/**` + `src/app/api/tournaments/**`),
3. ESLint limpio sobre los archivos tocados.

Queda explícito para que, tres pasos más adelante, "build global rojo" no se lea como rotura nuestra: mientras los 48 errores sean de `src/features/career/`, el gate del gestor está verde. Se destraba solo cuando ese feature compile (o se saque del `include` de tsconfig).

**Actualización 2 (durante 1c-ii):** el WIP **ya no es huérfano** — se cableó a la ruta `src/app/juegos/minijuegos/carrera-rugby/` (`page.tsx` + `PlayerHeader.tsx` + `CareerFlow.tsx` + `nationalities.ts`), así que ahora un import roto **tumba el `next build` entero** en Turbopack (visto: `Export flagFor doesn't exist in target module`), no solo el type-check. Además es un **blanco móvil**: en una misma sesión pasó por 48 errores de tipos → 0 → build verde → build roto por `flagFor` → build verde otra vez. **Regla operativa:** al correr el build, si el error cae en `src/app/juegos/**` o `src/features/career/**`, es este WIP, no el gestor. El gate del gestor sigue siendo `tsc` filtrado (excluir career+juegos) + parse CSS (postcss) + ESLint sobre lo tocado.

**Evidencia Fase 1b:** Turbopack ✓ (11.5s); `tsc --noEmit` → 48 errores, todos en `src/features/career/`, 0 en torneos; ESLint sobre `TournamentOperationTab.tsx` exit 0.

**Actualización (durante Fase 1c, build tras 1c-i):** career **type-chequea limpio ahora** (full check con `.tsbuildinfo` fresco → 0 errores; build `EXIT=0`, árbol de rutas completo). **No bloqueante al día de hoy.** NO se marca "resuelto": el feature sigue `?? untracked` y **nadie de esta línea de trabajo lo tocó** — solo se constata que hoy no rompe el build. Si el WIP vuelve a introducir errores de tipos, H8 vuelve a aplicar.

---

## H9. Paridad roster-grid: gestión de fase por grupo es desktop-only
**Estado:** anotado, NO tocado (diferencia funcional legítima entre vistas, no deuda de Fase 1c). Detectado en el mapeo de Participantes (1c).

El `phase-assignment-panel` + `phase-roster-grid` (`TournamentParticipantsTab.tsx`) muestra, en desktop, el roster de cada fase agrupado por grupo con quitar-de-fase por miembro. La vista mobile (cards) NO visualiza ese roster: gestiona fases vía phase-tabs (filtro) + sheet "Asignar a fase". Ambas vistas operan sobre la misma data y ambas pueden asignar/quitar; la diferencia es solo de *visualización del roster por grupo*, que mobile no ofrece inline. Es una decisión de densidad por form-factor (Fase 2: cards ≠ tabla), no una regresión. Si se quisiera paridad, habría que portar una versión compacta del roster-grid a un sheet mobile — trabajo de UX aparte, fuera del alcance de la de-duplicación de render de 1c.
