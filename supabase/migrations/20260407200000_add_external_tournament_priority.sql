-- Persist custom public ordering for API-managed external tournaments.

ALTER TABLE public.external_tournaments
    ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

UPDATE public.external_tournaments
SET priority = 0
WHERE priority IS NULL;

COMMENT ON COLUMN public.external_tournaments.priority IS
    'Custom public ordering priority for external/API tournaments. Higher numbers are shown first; ties fall back to alphabetical order.';
