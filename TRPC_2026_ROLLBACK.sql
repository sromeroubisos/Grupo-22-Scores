-- Rollback de la carga TRPC 2026 (4 torneos nuevos de la Patagonia).
BEGIN;

-- Tierra del Fuego Apertura
DELETE FROM public.tournament_standings WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.matches WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.team_season_entries WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.tournament_participants WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257');
DELETE FROM public.tournament_phases WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.tournament_seasons WHERE tournament_id = '930099ac-3b63-4493-9228-d9f36c184257';
DELETE FROM public.tournaments WHERE id = '930099ac-3b63-4493-9228-d9f36c184257';

-- Torneo Cordillerano
DELETE FROM public.tournament_standings WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.matches WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.team_season_entries WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.tournament_participants WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7');
DELETE FROM public.tournament_phases WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.tournament_seasons WHERE tournament_id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';
DELETE FROM public.tournaments WHERE id = '98c6fd08-eae5-454b-9769-2dc3ef7040f7';

-- Torneo Oficial Mayores - Alto Valle
DELETE FROM public.tournament_standings WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.matches WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.team_season_entries WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.tournament_participants WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e');
DELETE FROM public.tournament_phases WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.tournament_seasons WHERE tournament_id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';
DELETE FROM public.tournaments WHERE id = '2cd7ab3c-64de-48ae-8cac-ffdf928dda6e';

-- Primera B - Alto Valle
DELETE FROM public.tournament_standings WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.matches WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.team_season_entries WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.tournament_participants WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7');
DELETE FROM public.tournament_phases WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';
DELETE FROM public.tournaments WHERE id = 'de168b54-bcfd-4986-a6c3-b653f2fa2ff7';

DELETE FROM public.clubs WHERE id IN ('los-patos-r-c', 'san-martin-de-los-andes-rugby-hockey-club');

COMMIT;
