-- Rollback de la carga del Nacional de Clubes Femenino 2026.
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos
-- los referencian por FK.
BEGIN;

-- Nacional de Clubes Femenino
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d');
DELETE FROM public.matches WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
DELETE FROM public.team_season_entries WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
DELETE FROM public.tournament_participants WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d');
DELETE FROM public.tournament_phases WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
DELETE FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';
DELETE FROM public.tournaments WHERE id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d';

-- Nacional de Clubes Femenino Juveniles
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd');
DELETE FROM public.matches WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
DELETE FROM public.team_season_entries WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
DELETE FROM public.tournament_participants WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd');
DELETE FROM public.tournament_phases WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '09995687-9182-49e1-a521-f593f54a4ecd';
DELETE FROM public.tournament_seasons WHERE tournament_id = '09995687-9182-49e1-a521-f593f54a4ecd';
DELETE FROM public.tournaments WHERE id = '09995687-9182-49e1-a521-f593f54a4ecd';

-- Clubes creados por esta corrida
DELETE FROM public.clubs WHERE id IN ('palihue-rc', 'taborin-rc', 'aguilas-rc-saenz-pena', 'indios-de-bolivar', 'aguara-rc-jardin-america');

-- Escudos completados (estaban vacíos)
UPDATE public.clubs SET logo_url = NULL WHERE id IN ('bajo-hondo');

COMMIT;
