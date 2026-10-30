-- Rollback de la carga URTDF 2026 (Zona Competencia y M18).
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos
-- los referencian por FK.
BEGIN;

-- URTDF Zona Competencia
DELETE FROM public.tournament_standings WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.matches WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.team_season_entries WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.tournament_participants WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e');
DELETE FROM public.tournament_phases WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'e77a678a-776c-412e-a012-2fd17bde630e';
DELETE FROM public.tournaments WHERE id = 'e77a678a-776c-412e-a012-2fd17bde630e';

-- URTDF Juveniles M18
DELETE FROM public.tournament_standings WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.matches WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.team_season_entries WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.tournament_participants WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83');
DELETE FROM public.tournament_phases WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.tournament_seasons WHERE tournament_id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';
DELETE FROM public.tournaments WHERE id = '4ded08da-df73-4865-92c3-dbb0f8c6ae83';

-- Clubes creados por esta corrida
DELETE FROM public.clubs WHERE id IN ('ushuaia-rugby-club', 'universitario-de-rio-grande', 'tolhuin-rugby-club', 'club-colegio-del-sur', 'rio-grande-rugby-hockey-club');

COMMIT;
