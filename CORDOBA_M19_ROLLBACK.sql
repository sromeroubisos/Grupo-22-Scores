-- Rollback de la carga del Torneo Cordobés M19 "A" 2026.
-- Borra el torneo con todo lo que le cuelga y las fichas M19 "A" que creó la carga.
BEGIN;

DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-a';

DELETE FROM public.club_derivatives WHERE derived_club_id IN ('carlos-paz-rugby-club-m19-a', 'club-la-tablada-m19-a', 'club-palermo-bajo-m19-a', 'club-universitario-de-cordoba-m19-a', 'cordoba-athletic-club-m19-a', 'jockey-club-cordoba-m19-a', 'jockey-club-de-villa-maria-m19-a', 'san-martin-de-villa-maria-m19-a', 'tala-rugby-club-m19-a', 'uru-cure-rugby-club-m19-a');
DELETE FROM public.clubs WHERE id IN ('carlos-paz-rugby-club-m19-a', 'club-la-tablada-m19-a', 'club-palermo-bajo-m19-a', 'club-universitario-de-cordoba-m19-a', 'cordoba-athletic-club-m19-a', 'jockey-club-cordoba-m19-a', 'jockey-club-de-villa-maria-m19-a', 'san-martin-de-villa-maria-m19-a', 'tala-rugby-club-m19-a', 'uru-cure-rugby-club-m19-a');

COMMIT;
