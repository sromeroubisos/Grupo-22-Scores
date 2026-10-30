-- Rollback del alta de la Super XV 2026-27.
BEGIN;
DELETE FROM public.tournament_standings WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.matches WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.team_season_entries WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.tournament_participants WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.tournament_rounds WHERE phase_id = '81c6ae2d-0292-44f0-9fbb-9d28b9d61e8d';
DELETE FROM public.tournament_phases WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.tournament_seasons WHERE tournament_id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.tournaments WHERE id = '523c9aa9-cf5b-4c67-a9e2-fbdf206af681';
DELETE FROM public.club_external_ids WHERE provider = 'superxv' AND external_id IN ('aac', 'agronomia-rugby', 'cf-belenenses', 'sl-benfica', 'gds-cascais', 'cdul', 'cdup', 'gd-direito', 'rc-santarem', 'cr-sao-miguel', 'cr-tecnico', 'cr-setubal');
DELETE FROM public.clubs WHERE id = 'cr-setubal';
COMMIT;
