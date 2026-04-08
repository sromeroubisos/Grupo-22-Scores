-- Allow decimal competition points for per-match overrides and standings totals.

ALTER TABLE public.matches
  ALTER COLUMN home_base_points TYPE numeric USING home_base_points::numeric,
  ALTER COLUMN away_base_points TYPE numeric USING away_base_points::numeric,
  ALTER COLUMN home_bonus_points TYPE numeric USING home_bonus_points::numeric,
  ALTER COLUMN away_bonus_points TYPE numeric USING away_bonus_points::numeric;

ALTER TABLE public.matches
  ALTER COLUMN home_base_points SET DEFAULT 0,
  ALTER COLUMN away_base_points SET DEFAULT 0,
  ALTER COLUMN home_bonus_points SET DEFAULT 0,
  ALTER COLUMN away_bonus_points SET DEFAULT 0;

ALTER TABLE public.tournament_standings
  ALTER COLUMN points TYPE numeric USING points::numeric,
  ALTER COLUMN bonus_points TYPE numeric USING bonus_points::numeric;

ALTER TABLE public.tournament_standings
  ALTER COLUMN points SET DEFAULT 0,
  ALTER COLUMN bonus_points SET DEFAULT 0;

NOTIFY pgrst, 'reload schema';
