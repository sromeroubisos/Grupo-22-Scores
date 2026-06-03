-- Endurece la unicidad de public.prode_rankings.
--
-- El constraint original
--   UNIQUE (competition_id, user_id, scope_type, round_key, private_league_id)
-- NO protegía las filas de scope 'global' ni 'private_league': round_key es
-- siempre NULL y private_league_id es NULL en el scope global. Postgres, por
-- defecto (NULLS DISTINCT), considera que dos filas con un NULL en cualquiera de
-- esas columnas NO colisionan, así que el constraint nunca disparaba para ellas.
--
-- upsertCompetitionRankingScope() hacía read-then-insert/update en la app (no
-- atómico). Bajo refresh concurrente (cron + render de /prode/[slug] corriendo en
-- lambdas distintos, sin lock compartido) ambas corridas podían insertar la misma
-- fila de ranking → filas duplicadas que refreshUserTotals() suma por usuario,
-- inflando el ranking global con doble conteo.
--
-- Esta migración (1) deduplica lo que ya exista y (2) reemplaza el constraint por
-- uno que sí compara los NULL, dejando que el upsert atómico converja a una sola
-- fila por scope.
--
-- Requiere PostgreSQL 15+ (NULLS NOT DISTINCT). Supabase corre PG15+.

-- 1) Deduplicar: conservar solo la fila más reciente por clave lógica de scope.
WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY
                competition_id,
                user_id,
                scope_type,
                COALESCE(round_key, ''),
                COALESCE(private_league_id::text, '')
            ORDER BY computed_at DESC, updated_at DESC, id DESC
        ) AS rn
    FROM public.prode_rankings
)
DELETE FROM public.prode_rankings r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- 2) Reemplazar el constraint por uno que compare los NULL como iguales.
ALTER TABLE public.prode_rankings
    DROP CONSTRAINT IF EXISTS prode_rankings_scope_unique;

ALTER TABLE public.prode_rankings
    ADD CONSTRAINT prode_rankings_scope_unique
    UNIQUE NULLS NOT DISTINCT (competition_id, user_id, scope_type, round_key, private_league_id);
