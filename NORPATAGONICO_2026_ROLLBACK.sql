-- Rollback de la carga del Torneo Norpatagónico 2026.
-- No toca clubes: los ocho ya existían.
BEGIN;

DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499');
DELETE FROM public.tournament_standings WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
DELETE FROM public.matches WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
DELETE FROM public.tournament_phase_participants WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
DELETE FROM public.team_season_entries WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
DELETE FROM public.tournament_participants WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499');
DELETE FROM public.tournament_phases WHERE season_id = '39ad1c93-c6ad-4b49-a971-74c221867499';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '46313785-4686-4e69-b1de-d664527c143c';
DELETE FROM public.tournament_seasons WHERE id = '39ad1c93-c6ad-4b49-a971-74c221867499';
DELETE FROM public.tournaments WHERE id = '46313785-4686-4e69-b1de-d664527c143c';

COMMIT;
