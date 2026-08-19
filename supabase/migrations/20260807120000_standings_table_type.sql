-- `table_type` pasa a ser una columna real de public.tournament_standings.
--
-- Hasta hoy la perspectiva de una tabla (general / local / visitante) vivía
-- adentro del JSONB `stats`, donde ningún índice ni ninguna cláusula WHERE la
-- podía ver. Dos consecuencias, las dos verificadas:
--
--   1. El borrado previo al recálculo (recalculateStandings.ts) filtra por
--      torneo, fase, temporada y grupo, pero NO por perspectiva. Un operador con
--      el switch en "Local" que apretaba Recalcular borraba la tabla general
--      publicada y la reemplazaba por la de local. Silencioso e irreversible.
--   2. Los once lugares que leen la tabla tampoco podían filtrar, así que
--      publicar local y visitante habría triplicado las filas por equipo en la
--      página pública, en el sembrado de playoff y en el arrastre de puntos
--      entre fases.
--
-- El UNIQUE viejo —(tournament_id, phase_id, group_id, club_id)— además nunca
-- incluyó `season_id`, aunque el borrado sí filtra por temporada. Acá entra.
--
-- Requiere PostgreSQL 15+ (NULLS NOT DISTINCT). Supabase corre PG15+.
--
-- Esta migración es el PASO 2 de un operativo de cuatro, con un archivo por paso
-- para que ninguno se dispare por accidente al pegar otro:
--
--   1. supabase/EJECUTAR_STANDINGS_TABLE_TYPE.sql     diagnóstico (sólo lee)
--   2. este archivo                                   el cambio de esquema
--   3. supabase/EJECUTAR_STANDINGS_VERIFICACION.sql   comprobación (sólo lee)
--   4. supabase/EJECUTAR_STANDINGS_RECORTE_ESCUDOS.sql  destructivo, NO se corre
--      hasta verificar en producción que los escudos se sirven por proxy.
--
-- Correr el paso 1 ANTES de esta migración: si `stats.table_type` tiene algún
-- valor fuera de general/home/away, el CHECK del paso 3 de acá abajo la aborta
-- entera.

-- 1) La columna. En PG11+ un ADD COLUMN con DEFAULT no reescribe la tabla.
ALTER TABLE public.tournament_standings
    ADD COLUMN IF NOT EXISTS table_type text NOT NULL DEFAULT 'general';

-- 2) Backfill desde el JSONB, sólo para valores de la whitelist. `stats.table_type`
--    NO se borra: queda de respaldo una release, por si hay que reconstruir.
UPDATE public.tournament_standings
SET table_type = stats->>'table_type'
WHERE stats->>'table_type' IN ('general', 'home', 'away')
  AND table_type IS DISTINCT FROM stats->>'table_type';

-- 3) Segunda línea de defensa. La primera es normalizeTableType() en el endpoint
--    (src/lib/standings/tableType.ts); hasta ahora el valor del body entraba sin
--    validar y cualquier string terminaba guardado.
ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_table_type_check;

ALTER TABLE public.tournament_standings
    ADD CONSTRAINT tournament_standings_table_type_check
    CHECK (table_type IN ('general', 'home', 'away'));

-- 4) Duplicados, ANTES del índice.
--
--    Sutileza que importa: PARTITION BY trata los NULL como IGUALES y el UNIQUE
--    viejo los trataba como distintos, así que este paso encuentra colisiones que
--    el constraint nunca detectó — justamente las filas con group_id NULL, que
--    son la mayoría.
--
--    Borra filas, así que primero deja el respaldo. La tabla queda en la base a
--    propósito: es la red por si el recorte de la fase siguiente sale mal.
CREATE TABLE IF NOT EXISTS public.tournament_standings_bak AS
SELECT * FROM public.tournament_standings;

WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY
                tournament_id,
                COALESCE(season_id::text, ''),
                COALESCE(phase_id::text, ''),
                COALESCE(group_id::text, ''),
                club_id,
                table_type
            ORDER BY last_updated DESC NULLS LAST, id DESC
        ) AS rn
    FROM public.tournament_standings
)
DELETE FROM public.tournament_standings s
USING ranked
WHERE s.id = ranked.id
  AND ranked.rn > 1;

-- 5) La unicidad de verdad, con las seis columnas del scope y comparando los
--    NULL. Entre el DROP y el ADD la tabla queda sin unicidad: por eso van
--    juntos en la misma migración, que Supabase corre en una transacción.
ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_unique_club;

-- El autonombrado del CREATE TABLE original. Una migración vieja ya lo baja,
-- pero en una base levantada de cero desde el historial puede seguir vivo.
ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_tournament_id_phase_id_group_id_club_i_key;

ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_scope_unique;

ALTER TABLE public.tournament_standings
    ADD CONSTRAINT tournament_standings_scope_unique
    UNIQUE NULLS NOT DISTINCT (
        tournament_id,
        season_id,
        phase_id,
        group_id,
        club_id,
        table_type
    );

-- 6) Índice de lectura: el orden en que consultan los once lectores (una fase,
--    una perspectiva, un grupo, ordenado por posición).
CREATE INDEX IF NOT EXISTS idx_tournament_standings_scope_read
    ON public.tournament_standings (tournament_id, phase_id, table_type, group_id, position);
