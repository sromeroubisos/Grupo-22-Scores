-- Rollback de la carga del Select 12.
-- Borra el torneo que creó esta corrida y los clubes nuevos. Los clubes van
-- último: los partidos los referencian por FK.
BEGIN;

DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540');
DELETE FROM public.tournament_standings WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.matches WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.team_season_entries WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.tournament_participants WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540');
DELETE FROM public.tournament_phases WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';
DELETE FROM public.tournaments WHERE id = 'bb60ab6f-73c4-4c6a-a973-4c58241a4540';

-- Clubes de esta carga
DELETE FROM public.clubs WHERE id IN ('paraguay-m17', 'formosa-m17', 'misiones-m17', 'santiaguena-m17', 'andina-m17', 'jujena-m17', 'chubut-m17', 'lagos-del-sur-m17', 'sur-m17', 'san-luis-m17', 'tierra-del-fuego-m17');

COMMIT;
