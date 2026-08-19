-- ============================================================================
-- Índices de performance para el path de CARGA MANUAL + LECTURA EN VIVO
-- (Diagnóstico Fase 1 → Fase 2, Paso 1). Riesgos que atacan:
--   · #1 matches(season_id): filtro de temporada en detalle/fixture/standings.
--   · #2 matches(tournament_id, phase_id, status): recompute de standings (corre
--        tras CADA resultado final) + lecturas de posiciones. El más valioso.
--
-- ── APLICACIÓN: MANUAL, en el SQL editor de Supabase, UN STATEMENT POR VEZ ──
-- Este archivo queda como REGISTRO HISTÓRICO. NO se aplica con `supabase db push`
-- ni con los scripts `pg` del repo (mandan el archivo entero como una sola
-- transacción implícita, y CREATE INDEX CONCURRENTLY FALLA dentro de una
-- transacción → error 25001). Por eso el archivo NO lleva BEGIN/COMMIT.
--
-- Pasos exactos (pegá y ejecutá UNO a la vez, no todos juntos):
--   1) Ejecutar el CREATE INDEX #1.
--   2) Ejecutar el CREATE INDEX #2.
--   (No hay #3 — ver nota al final.)
--
-- ── SI UN BUILD CONCURRENTLY FALLA A MITAD ──
-- Un CONCURRENTLY interrumpido deja un índice INVALID que NO sirve consultas y
-- que `IF NOT EXISTS` saltearía (existe, aunque inválido). Hay que detectarlo,
-- DROPearlo y reintentar el CREATE:
--
--   -- (a) Detectar índices inválidos de esta migración:
--   SELECT c.relname AS index_name, i.indisvalid, i.indisready
--   FROM pg_index i
--   JOIN pg_class c     ON c.oid = i.indexrelid
--   JOIN pg_class t     ON t.oid = i.indrelid
--   JOIN pg_namespace n ON n.oid = t.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN ('idx_matches_season_id', 'idx_matches_tournament_phase_status')
--     AND i.indisvalid = false;
--
--   -- (b) Si aparece alguno, dropearlo (sin lock; también fuera de transacción):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_matches_season_id;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_matches_tournament_phase_status;
--
--   -- (c) Reintentar el CREATE INDEX correspondiente.
-- ============================================================================

-- #1 — matches(season_id), PARCIAL. Las consultas filtran siempre por un UUID de
--      temporada no-nulo (`.eq('season_id', <uuid>)`), así que excluimos las filas
--      con season_id NULL: índice más chico y sin costo de mantenimiento para
--      partidos sin temporada asociada.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_season_id
    ON public.matches (season_id)
    WHERE season_id IS NOT NULL;

-- #2 — matches(tournament_id, phase_id, status). Sirve directo a
--      recalculateStandings.buildMatchesQuery (.eq tournament_id .eq phase_id
--      .in status) que corre tras cada resultado final, y a las lecturas de
--      posiciones (standings/route). status vía IN(...) es predicado de acceso
--      btree válido, y el orden de columnas matchea el orden de los filtros.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_tournament_phase_status
    ON public.matches (tournament_id, phase_id, status);

-- #3 — DESCARTADO: tournaments(is_visible, priority, display_name).
--      Motivo: `tournaments` tiene ≤3000 filas (PUBLIC_TOURNAMENTS_DB_QUERY_LIMIT),
--      con lo que el ORDER BY de /api/public/tournaments ya resuelve en sub-ms sin
--      índice; el mantenimiento no se justifica. Además, la forma pedida no
--      matcheaba la query real: `is_visible <> false` no es predicado de acceso
--      btree, el orden es `priority DESC, display_name ASC, name ASC` (mixto) y
--      omitía `name`.
--      RECONSIDERAR (opción b) SOLO si a futuro: (1) la tabla crece a decenas de
--      miles de filas, o (2) ese endpoint aparece como cuello real en métricas.
--      En ese caso el índice correcto es parcial + ordenado:
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tournaments_public_order
--            ON public.tournaments (priority DESC, display_name, name)
--            WHERE is_visible <> false;
