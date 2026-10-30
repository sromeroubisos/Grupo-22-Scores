-- Rollback de la carga histórica de rugbyarchive (Interior A/B/C + Nacional A/B).
-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las
-- temporadas 2026 del Interior A/B, cargadas a mano, no están en las listas.
BEGIN;
COMMIT;
