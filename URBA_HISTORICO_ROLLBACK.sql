-- Rollback de la carga histórica de URBA 2021-2025. Generado ANTES de ejecutar.
-- 677 torneos · 41341 partidos · 6873 participantes
--
-- El corte es el AÑO: season_id entre 2021 y 2025 y external_id de URBA.
-- Los 134 de 2026 tienen season_id = 2026 y no los toca ninguna de estas líneas.
-- El orden es hijo -> padre: las FK no admiten el inverso.

BEGIN;

-- 1. Partidos
DELETE FROM public.matches m USING public.tournaments t
  WHERE m.tournament_id = t.id AND t.external_id LIKE 'urba:%'
    AND t.season_id IN ('2021','2022','2023','2024','2025');

-- 2. Participantes
DELETE FROM public.tournament_participants p USING public.tournaments t
  WHERE p.tournament_id = t.id AND t.external_id LIKE 'urba:%'
    AND t.season_id IN ('2021','2022','2023','2024','2025')
    AND p.notes = 'urba-import';

-- 3. Fases
DELETE FROM public.tournament_phases f USING public.tournaments t
  WHERE f.tournament_id = t.id AND t.external_id LIKE 'urba:%'
    AND t.season_id IN ('2021','2022','2023','2024','2025');

-- 4. Torneos
DELETE FROM public.tournaments WHERE external_id LIKE 'urba:%'
  AND season_id IN ('2021','2022','2023','2024','2025');

-- 5. Verificación antes de confirmar (tiene que dar 134 y 10917)
--   SELECT count(*) FROM public.tournaments WHERE external_id LIKE 'urba:%';
--   SELECT count(*) FROM public.matches WHERE external_id LIKE 'urba:%';

COMMIT;
