-- Drop stale index if it somehow survived (safety net)
DROP INDEX IF EXISTS public.idx_tournaments_sport;

-- Re-create on the current column
CREATE INDEX IF NOT EXISTS idx_tournaments_sport_id
    ON public.tournaments (sport_id);

NOTIFY pgrst, 'reload schema';
