-- Rollback de la carga del Sudamericano de Rugby Seven 2026.
-- Borra SÓLO lo que creó esta corrida. Las selecciones van último: los torneos
-- las referencian por FK.
BEGIN;

-- Sudamericano de Rugby Seven
DELETE FROM public.matches WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.tournament_standings WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.team_season_entries WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.tournament_participants WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0');
DELETE FROM public.tournament_phases WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';
DELETE FROM public.tournaments WHERE id = 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0';

-- Sudamericano de Rugby Seven Femenino
DELETE FROM public.matches WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.tournament_standings WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.team_season_entries WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.tournament_participants WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3');
DELETE FROM public.tournament_phases WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.tournament_seasons WHERE tournament_id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';
DELETE FROM public.tournaments WHERE id = '47d4eb6b-fc1b-4a21-b469-5cda25752fa3';

-- Selecciones creadas por esta corrida
DELETE FROM public.clubs WHERE id IN ('chile-7s', 'brasil-7s', 'colombia-7s', 'paraguay-7s', 'peru-7s', 'guatemala-7s', 'ecuador-7s', 'venezuela-7s', 'republica-dominicana-7s', 'honduras-7s', 'uruguay-7s-w', 'paraguay-7s-w', 'guatemala-7s-w', 'republica-dominicana-7s-w', 'colombia-7s-w', 'ecuador-7s-w');

COMMIT;
