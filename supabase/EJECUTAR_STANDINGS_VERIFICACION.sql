-- =============================================================================
-- table_type en tournament_standings — PASO 3 de 4: VERIFICACIÓN
-- =============================================================================
--
-- Este archivo SÓLO LEE. Pegalo entero y corrélo.
--
-- IMPORTANTE, y es la razón de que esté armado así: el editor SQL de Supabase
-- muestra únicamente el resultado de la ÚLTIMA sentencia. Un archivo con siete
-- consultas sueltas ejecuta las siete y te deja ver una — las otras seis se
-- pierden en silencio, que es peor que no correrlas.
--
-- Por eso la última sentencia de este archivo es UN VEREDICTO: una sola fila que
-- responde las siete preguntas a la vez. El detalle de cada una está más abajo,
-- comentado, para cuando algo dé mal y haya que mirarlo de cerca.
--
-- Corré esto DESPUÉS de aplicar
-- supabase/migrations/20260807120000_standings_table_type.sql.


-- -----------------------------------------------------------------------------
-- EL VEREDICTO. Es la única sentencia activa del archivo.
--
-- Se lee así:
--   veredicto ............ "OK" o "REVISAR"; si dice OK, terminaste
--   columna_ok ........... table_type existe y es NOT NULL
--   duplicados ........... tiene que ser 0
--   unique_ok ............ el constraint de seis columnas está
--   check_ok ............. el CHECK de general/home/away está
--   indice_ok ............ el índice de lectura está
--   filas_antes/ahora .... la foto previa contra la actual
--   duplicados_borrados .. cuántas filas se llevó el dedup
--   tipos_presentes ...... qué perspectivas hay guardadas hoy
-- -----------------------------------------------------------------------------
WITH chequeos AS (
    SELECT
        EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'tournament_standings'
              AND column_name = 'table_type'
              AND is_nullable = 'NO'
        ) AS columna_ok,

        (
            SELECT count(*) FROM (
                SELECT 1
                FROM public.tournament_standings
                GROUP BY tournament_id, season_id, phase_id, group_id, club_id, table_type
                HAVING count(*) > 1
            ) d
        ) AS duplicados,

        EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.tournament_standings'::regclass
              AND conname = 'tournament_standings_scope_unique'
        ) AS unique_ok,

        EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.tournament_standings'::regclass
              AND conname = 'tournament_standings_table_type_check'
        ) AS check_ok,

        EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'idx_tournament_standings_scope_read'
        ) AS indice_ok,

        (SELECT count(*) FROM public.tournament_standings)     AS filas_ahora,
        (SELECT count(*) FROM public.tournament_standings_bak) AS filas_antes,

        (
            SELECT string_agg(DISTINCT table_type, ', ' ORDER BY table_type)
            FROM public.tournament_standings
        ) AS tipos_presentes
)
SELECT
    CASE
        WHEN columna_ok AND duplicados = 0 AND unique_ok AND check_ok AND indice_ok
            THEN 'OK - la migracion quedo aplicada. Espera 30s y proba recalcular en Local.'
        ELSE 'REVISAR - alguna columna de abajo esta en false o duplicados > 0.'
    END                                AS veredicto,
    columna_ok,
    duplicados,
    unique_ok,
    check_ok,
    indice_ok,
    filas_antes,
    filas_ahora,
    filas_antes - filas_ahora          AS duplicados_borrados,
    tipos_presentes
FROM chequeos;


-- =============================================================================
-- DETALLE — sólo si el veredicto dijo REVISAR.
--
-- Descomentá UNA a la vez (o seleccionala con el mouse y ejecutá la selección:
-- el editor corre sólo lo seleccionado, que es la forma de ver el resultado de
-- una consulta del medio).
-- =============================================================================

-- Cuáles son los duplicados que quedaron:
-- SELECT tournament_id, season_id, phase_id, group_id, club_id, table_type,
--        count(*) AS filas
-- FROM public.tournament_standings
-- GROUP BY 1, 2, 3, 4, 5, 6
-- HAVING count(*) > 1;

-- La forma exacta de la columna:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'tournament_standings'
--   AND column_name = 'table_type';

-- Todos los constraints de la tabla:
-- SELECT conname, pg_get_constraintdef(oid) AS definicion
-- FROM pg_constraint
-- WHERE conrelid = 'public.tournament_standings'::regclass
-- ORDER BY conname;

-- Todos los índices de la tabla:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'tournament_standings'
-- ORDER BY indexname;

-- Cómo quedó repartido el backfill por perspectiva:
-- SELECT table_type, count(*) AS filas
-- FROM public.tournament_standings
-- GROUP BY 1 ORDER BY filas DESC;
