-- Rollback de la carga del M16 Desarrollo Norte 2026.
-- Borra la temporada que creó esta corrida, le devuelve al torneo la anterior
-- como actual y borra los clubes nuevos. Los clubes van último: los partidos
-- los referencian por FK.
BEGIN;

DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7');
DELETE FROM public.tournament_standings WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
DELETE FROM public.matches WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
DELETE FROM public.tournament_phase_participants WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
DELETE FROM public.team_season_entries WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
DELETE FROM public.tournament_participants WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7');
DELETE FROM public.tournament_phases WHERE season_id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
UPDATE public.tournaments SET current_season_id = 'fb9829f0-a768-4a19-8918-48b3e1d98ba2', season_id = '2025', format = 'league' WHERE id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.tournament_seasons WHERE id = 'dbcd2ef6-93c1-45ee-a2f0-9811815aacc7';
UPDATE public.tournament_seasons SET status = 'active', is_active = true WHERE id = 'fb9829f0-a768-4a19-8918-48b3e1d98ba2';

-- Clubes de esta carga
DELETE FROM public.clubs WHERE id IN ('cordobesa-m16', 'cuyo-m16', 'rosario-m16', 'salta-m16', 'tucuman-m16', 'misiones-m16', 'santiaguena-m16');

COMMIT;
