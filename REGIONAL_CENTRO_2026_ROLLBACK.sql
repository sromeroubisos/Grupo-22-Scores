-- Rollback de la carga del Regional Centro "A" y "B" 2026.
-- Borra las dos temporadas con todo lo que les cuelga y los dos torneos.
-- No toca clubes: los doce ya existían antes de esta carga.
BEGIN;

-- Regional Centro "A"
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f');
DELETE FROM public.tournament_standings WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
DELETE FROM public.matches WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
DELETE FROM public.tournament_phase_participants WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
DELETE FROM public.team_season_entries WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
DELETE FROM public.tournament_participants WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f');
DELETE FROM public.tournament_phases WHERE season_id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'bcfca672-1c00-4f62-833d-cc053786ad12';
DELETE FROM public.tournament_seasons WHERE id = '121347a2-976d-4ff0-98f2-cdafcd887b1f';
DELETE FROM public.tournaments WHERE id = 'bcfca672-1c00-4f62-833d-cc053786ad12';

-- Regional Centro "B"
DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc');
DELETE FROM public.tournament_standings WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
DELETE FROM public.matches WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
DELETE FROM public.tournament_phase_participants WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
DELETE FROM public.team_season_entries WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
DELETE FROM public.tournament_participants WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc');
DELETE FROM public.tournament_phases WHERE season_id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '4b04d1e6-a9a7-47ea-810e-9c6bede377aa';
DELETE FROM public.tournament_seasons WHERE id = '68a653c0-56e9-4d47-9d9b-5418c93d35dc';
DELETE FROM public.tournaments WHERE id = '4b04d1e6-a9a7-47ea-810e-9c6bede377aa';

COMMIT;
