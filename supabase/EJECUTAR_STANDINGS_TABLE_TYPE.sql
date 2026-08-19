-- =============================================================================
-- table_type en tournament_standings — PASO 1 de 4: DIAGNÓSTICO
-- =============================================================================
--
-- Este archivo SÓLO LEE. Se puede pegar entero en el editor SQL de Supabase sin
-- riesgo: no hay un solo INSERT, UPDATE, DELETE ni ALTER.
--
-- OJO CON EL EDITOR: muestra únicamente el resultado de la ÚLTIMA sentencia. Si
-- pegás las cuatro consultas juntas vas a ver sólo la 1.d. Para leer una del
-- medio, seleccionala con el mouse y ejecutá la selección — el editor corre sólo
-- lo seleccionado.
--
-- La 1.d va última a propósito: es la que decide si podés seguir.
--
-- Orden completo del operativo, un archivo por paso:
--
--   1. supabase/EJECUTAR_STANDINGS_TABLE_TYPE.sql   ← estás acá (diagnóstico)
--   2. supabase/migrations/20260807120000_standings_table_type.sql
--      (la migración: columna, backfill, CHECK, respaldo + dedup, UNIQUE, índice)
--   3. supabase/EJECUTAR_STANDINGS_VERIFICACION.sql (comprobar que quedó bien)
--   4. supabase/EJECUTAR_STANDINGS_RECORTE_ESCUDOS.sql
--      (destructivo — NO se corre hasta verificar los escudos en producción)
--
-- Antes iban los cuatro pasos en un archivo. Pegado entero, la verificación
-- consultaba `table_type` antes de que la migración la creara y todo abortaba en
-- esa línea; y peor, un archivo con un DELETE de escudos adentro no debería
-- poder dispararse de un solo pegado. Por eso ahora son cuatro.


-- -----------------------------------------------------------------------------
-- 1.a  La versión de PostgreSQL tiene que ser 15 o mayor.
--      El UNIQUE de la migración usa NULLS NOT DISTINCT, que no existe antes.
-- -----------------------------------------------------------------------------
SELECT
    version()                                         AS pg_version,
    current_setting('server_version_num')::int        AS version_numerica,
    current_setting('server_version_num')::int >= 150000 AS sirve;


-- -----------------------------------------------------------------------------
-- 1.b  Qué valores de table_type hay hoy adentro del JSONB.
--
--      Si aparece alguno fuera de general/home/away, hay que normalizarlo ANTES
--      de correr la migración: su CHECK lo rechaza y la migración aborta entera.
--      La sentencia para normalizarlo está al final de este archivo, comentada.
-- -----------------------------------------------------------------------------
SELECT
    stats->>'table_type' AS table_type_en_stats,
    count(*)             AS filas
FROM public.tournament_standings
GROUP BY 1
ORDER BY filas DESC;


-- -----------------------------------------------------------------------------
-- 1.c  Cuánto pesa la tabla, cuánto de eso son escudos embebidos, y cuántos
--      huecos de scope hay (los NULL son los que el UNIQUE viejo no comparaba).
-- -----------------------------------------------------------------------------
SELECT
    count(*)                                                              AS filas_totales,
    count(*) FILTER (WHERE stats ? 'table_type')                          AS con_table_type,
    count(*) FILTER (WHERE stats ? 'team_logo')                           AS con_escudo_embebido,
    count(*) FILTER (WHERE season_id IS NULL)                             AS sin_temporada,
    count(*) FILTER (WHERE group_id IS NULL)                              AS sin_grupo,
    count(*) FILTER (WHERE phase_id IS NULL)                              AS sin_fase,
    pg_size_pretty(pg_total_relation_size('public.tournament_standings')) AS tamano
FROM public.tournament_standings;


-- -----------------------------------------------------------------------------
-- 1.d  Duplicados que el UNIQUE viejo NO detectaba.
--
--      El constraint era (tournament_id, phase_id, group_id, club_id) con NULLS
--      DISTINCT: dos filas con group_id NULL nunca colisionaban para Postgres,
--      y son la mayoría. Este GROUP BY sí las agrupa. Lo que salga acá es lo que
--      el paso 4 de la migración va a deduplicar, conservando la fila con el
--      last_updated más reciente y dejando un respaldo completo en
--      tournament_standings_bak.
-- -----------------------------------------------------------------------------
SELECT
    tournament_id,
    season_id,
    phase_id,
    group_id,
    club_id,
    stats->>'table_type' AS table_type,
    count(*)             AS filas
FROM public.tournament_standings
GROUP BY 1, 2, 3, 4, 5, 6
HAVING count(*) > 1
ORDER BY filas DESC
LIMIT 50;


-- -----------------------------------------------------------------------------
-- SÓLO SI 1.b devolvió un valor fuera de general/home/away.
-- Descomentá, ajustá y corré ANTES de la migración.
-- -----------------------------------------------------------------------------
-- UPDATE public.tournament_standings
-- SET stats = jsonb_set(stats, '{table_type}', '"general"')
-- WHERE stats->>'table_type' IS NOT NULL
--   AND stats->>'table_type' NOT IN ('general', 'home', 'away');
