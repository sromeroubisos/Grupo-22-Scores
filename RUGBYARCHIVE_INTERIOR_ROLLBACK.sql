-- Rollback de la carga histórica de rugbyarchive (Interior A/B/C + Nacional A/B).
-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las
-- temporadas 2026 del Interior A/B, cargadas a mano, no están en las listas.
BEGIN;
-- regional-del-centro-b
DELETE FROM public.tournament_standings WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.matches WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.tournament_rounds WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.tournament_groups WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.tournament_phases WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.season_rosters WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.team_season_entries WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.tournament_participants WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017'));
DELETE FROM public.tournament_seasons WHERE tournament_id = 'b03656d2-b5d8-470b-9909-c11e9e2b3e47' AND season_code IN ('2007','2008','2017');
-- Torneos creados por esta carga (después de vaciar sus temporadas):
DELETE FROM public.tournaments WHERE slug IN ('regional-del-centro-b') AND id IN ('b03656d2-b5d8-470b-9909-c11e9e2b3e47');
COMMIT;
