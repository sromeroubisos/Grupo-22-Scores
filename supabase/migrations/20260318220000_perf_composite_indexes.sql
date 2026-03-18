-- ============================================
-- COMPOSITE INDEXES FOR PERFORMANCE
-- Optimizes fixture and standings queries
-- ============================================

-- Main fixture queries
CREATE INDEX IF NOT EXISTS idx_matches_tournament_phase_group_datetime 
  ON public.matches (tournament_id, phase_id, group_id, date_time);

CREATE INDEX IF NOT EXISTS idx_matches_tournament_round 
  ON public.matches (tournament_id, round_uuid);

-- Full standings lookup with position ordering
CREATE INDEX IF NOT EXISTS idx_standings_tournament_phase_group_position 
  ON public.tournament_standings (tournament_id, phase_id, group_id, position);

-- Tournament participants lookup
CREATE INDEX IF NOT EXISTS idx_participants_tournament_club 
  ON public.tournament_participants (tournament_id, club_id);

-- Group and Round lookups by phase
CREATE INDEX IF NOT EXISTS idx_groups_phase 
  ON public.tournament_groups (phase_id);

CREATE INDEX IF NOT EXISTS idx_rounds_phase 
  ON public.tournament_rounds (phase_id);
