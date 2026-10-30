-- Rollback de la carga del Torneo Nacional Desarrollo M16.
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos
-- los referencian por FK.
BEGIN;

-- M16 Desarrollo Sur
DELETE FROM public.tournament_standings WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.matches WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.team_season_entries WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.tournament_participants WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29');
DELETE FROM public.tournament_phases WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.tournament_seasons WHERE tournament_id = '3200e860-52a7-4649-9bec-2e7e37a2db29';
DELETE FROM public.tournaments WHERE id = '3200e860-52a7-4649-9bec-2e7e37a2db29';

-- M16 Desarrollo Norte
DELETE FROM public.tournament_standings WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.matches WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.team_season_entries WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.tournament_participants WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f');
DELETE FROM public.tournament_phases WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.tournament_seasons WHERE tournament_id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';
DELETE FROM public.tournaments WHERE id = '68f6f841-5952-41d3-826f-1fdf8e0e6e5f';

-- Torneo Nacional Desarrollo M16 - Copa de Oro
DELETE FROM public.tournament_standings WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.matches WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.team_season_entries WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.tournament_participants WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5');
DELETE FROM public.tournament_phases WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.tournament_seasons WHERE tournament_id = '5fb65e2a-552e-4589-8381-c182c4595ed5';
DELETE FROM public.tournaments WHERE id = '5fb65e2a-552e-4589-8381-c182c4595ed5';

-- Torneo Nacional Desarrollo M16 - Copa de Plata
DELETE FROM public.tournament_standings WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.matches WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.team_season_entries WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.tournament_participants WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7');
DELETE FROM public.tournament_phases WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'e81321c7-3627-4fd9-a911-761becf58ac7';
DELETE FROM public.tournaments WHERE id = 'e81321c7-3627-4fd9-a911-761becf58ac7';

-- Clubes creados por esta corrida
DELETE FROM public.clubs WHERE id IN ('chubut-m16', 'alto-valle-m16', 'austral-m16', 'lagos-del-sur-m16', 'oeste-m16', 'buenos-aires-m16', 'entrerriana-m16', 'mar-del-plata-m16', 'andina-m16');

COMMIT;
