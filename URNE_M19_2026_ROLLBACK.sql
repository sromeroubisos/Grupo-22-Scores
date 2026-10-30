-- Rollback de la carga URNE M19 2026 (Apertura y Oficial).
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos
-- los referencian por FK.
BEGIN;

-- Torneo Apertura URNE 2026 - M19
DELETE FROM public.tournament_standings WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539');
DELETE FROM public.matches WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.team_season_entries WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.tournament_participants WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539');
DELETE FROM public.tournament_phases WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.tournament_seasons WHERE tournament_id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';
DELETE FROM public.tournaments WHERE id = '4a6f0f77-e091-4d92-bb8d-28b5fcc32539';

-- Torneo Oficial URNE 2026 - M19
CREATE TEMP TABLE etiquetas_urne AS SELECT DISTINCT label_id FROM public.team_labels WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.team_labels WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.ui_labels WHERE id IN (SELECT label_id FROM etiquetas_urne);
DELETE FROM public.tournament_standings WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f');
DELETE FROM public.matches WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.team_season_entries WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.tournament_participants WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f');
DELETE FROM public.tournament_phases WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.tournament_seasons WHERE tournament_id = '6435f119-f6a5-4a68-953d-8844f0784f4f';
DELETE FROM public.tournaments WHERE id = '6435f119-f6a5-4a68-953d-8844f0784f4f';

-- Clubes creados por esta corrida
DELETE FROM public.clubs WHERE id IN ('regatas-de-resistencia-m19', 'taraguy-r-c-m19-a', 'taraguy-r-c-m19-b', 'aranduroga-r-c-m19-a', 'aranduroga-r-c-m19-b', 'sixty-r-c-m19', 'curne-m19', 'san-patricio-m19');

COMMIT;
