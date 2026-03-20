-- ============================================================
-- ADDITIONAL BACKWARD COMPATIBILITY
-- Purpose: cover legacy columns still referenced by older RPCs,
-- views or stale deploy bundles.
-- ============================================================

BEGIN;

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS live_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS external_id TEXT;

COMMIT;

NOTIFY pgrst, 'reload schema';
