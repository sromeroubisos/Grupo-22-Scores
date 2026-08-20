-- Rollback de la carga del Campeonato Argentino Juvenil.
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos
-- los referencian por FK.
BEGIN;

-- Campeonato Argentino Juvenil M17 - Zona Campeonato
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b');
DELETE FROM public.matches WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
DELETE FROM public.team_season_entries WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
DELETE FROM public.tournament_participants WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b');
DELETE FROM public.tournament_phases WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
DELETE FROM public.tournament_seasons WHERE tournament_id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';
DELETE FROM public.tournaments WHERE id = '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b';

-- Campeonato Argentino Juvenil M17 - Zona Ascenso
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818');
DELETE FROM public.matches WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
DELETE FROM public.team_season_entries WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
DELETE FROM public.tournament_participants WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818');
DELETE FROM public.tournament_phases WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
DELETE FROM public.tournament_seasons WHERE tournament_id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';
DELETE FROM public.tournaments WHERE id = '302a89ef-879f-446a-8fe8-8ffe7a2df818';

-- Campeonato Argentino Juvenil M18
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd');
DELETE FROM public.matches WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
DELETE FROM public.team_season_entries WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
DELETE FROM public.tournament_participants WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd');
DELETE FROM public.tournament_phases WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
DELETE FROM public.tournament_seasons WHERE tournament_id = '29990ec7-1333-4d59-88e5-08d3233bdafd';
DELETE FROM public.tournaments WHERE id = '29990ec7-1333-4d59-88e5-08d3233bdafd';

COMMIT;
