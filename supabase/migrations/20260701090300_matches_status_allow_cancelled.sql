-- Allow 'cancelled' as a valid matches.status value.
-- The original CHECK (defined inline in 20260218100000_schema_v2.sql:84 as
-- matches_status_check) only allowed scheduled/live/final/postponed/suspended,
-- but the WhatsApp webhook (and admin tooling) map "cancelado"/"cancelled" to
-- 'cancelled'. Defensive DROP IF EXISTS + ADD so the migration is idempotent.

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
    CHECK (status IN ('scheduled', 'live', 'final', 'postponed', 'suspended', 'cancelled'));
