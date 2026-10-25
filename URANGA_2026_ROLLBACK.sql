-- Rollback de la carga del Torneo Juvenil M15 "Eduardo Uranga".
-- Borra el torneo de esta corrida, las fichas M15 nuevas y las bases nuevas (los clubes van último: los partidos los referencian).
BEGIN;

DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec');
CREATE TEMP TABLE etiquetas_uranga AS SELECT DISTINCT label_id FROM public.team_labels WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.team_labels WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.ui_labels WHERE id IN (SELECT label_id FROM etiquetas_uranga);
DELETE FROM public.tournament_standings WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.matches WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.team_season_entries WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.tournament_participants WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec');
DELETE FROM public.tournament_phases WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.tournament_seasons WHERE tournament_id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';
DELETE FROM public.tournaments WHERE id = '6637aba8-8faf-4c92-ab90-4f5ae7d868ec';

DELETE FROM public.club_derivatives WHERE derived_club_id IN ('estudiantes-de-parana-m15-blanco', 'estudiantes-de-parana-m15-negro', 'club-social-la-rioja-m15', 'suri-r-c-m15', 'san-patricio-corrientes-m15', 'cpbm-mendoza-m15', 'sixty-r-c-m15', 'jockey-club-salta-m15-rojo', 'jockey-club-salta-m15-blanco', 'teque-r-c-m15', 'neuquen-r-c-m15-azul', 'neuquen-r-c-m15-rojo', 'regatas-de-resistencia-m15', 'santiago-lawn-tennis-m15-rojo', 'santiago-lawn-tennis-m15-blanco', 'los-teros-r-c-m15', 'mendoza-rugby-club-m15', 'lomas-r-c-posadas-m15', 'universitario-de-salta-m15', 'aranduroga-r-c-m15-blanco', 'aranduroga-r-c-m15-negro');
DELETE FROM public.clubs WHERE id IN ('estudiantes-de-parana-m15-blanco', 'estudiantes-de-parana-m15-negro', 'club-social-la-rioja-m15', 'suri-r-c-m15', 'san-patricio-corrientes-m15', 'cpbm-mendoza-m15', 'sixty-r-c-m15', 'jockey-club-salta-m15-rojo', 'jockey-club-salta-m15-blanco', 'teque-r-c-m15', 'neuquen-r-c-m15-azul', 'neuquen-r-c-m15-rojo', 'regatas-de-resistencia-m15', 'santiago-lawn-tennis-m15-rojo', 'santiago-lawn-tennis-m15-blanco', 'los-teros-r-c-m15', 'mendoza-rugby-club-m15', 'lomas-r-c-posadas-m15', 'universitario-de-salta-m15', 'aranduroga-r-c-m15-blanco', 'aranduroga-r-c-m15-negro', 'san-patricio-corrientes', 'cpbm-mendoza');

COMMIT;
