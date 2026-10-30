-- Rollback del alta de iSquad (FER 2026/27).
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos y
-- los alias los referencian por FK.
BEGIN;

-- División de Honor
DELETE FROM public.tournament_standings WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.matches WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.team_season_entries WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.tournament_participants WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262');
DELETE FROM public.tournament_phases WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';
DELETE FROM public.tournaments WHERE id = 'bbcf3820-0d8c-4e50-a79d-229065dba262';

-- Alias de equipos creados por esta corrida
DELETE FROM public.club_external_ids WHERE provider = 'isquad' AND external_id IN ('equipo:188', 'equipo:196', 'equipo:208', 'equipo:245', 'equipo:251', 'equipo:253', 'equipo:344', 'equipo:1405', 'equipo:1710', 'equipo:2060');

COMMIT;
