-- ============================================
-- ADD MATCH POINTS FIELDS
-- Per-match editable points for standings (base + bonus per team)
-- ============================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_base_points       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_base_points       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_bonus_points      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_bonus_points      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_autocalculated  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS points_override_reason text;

-- home_total_points and away_total_points are computed on the fly (base + bonus)
-- and are NOT stored to avoid sync issues.
