-- ════════════════════════════════════════════════════════════════════════
-- Playoff automatic scheduling
--
-- Lets a playoff phase pre-schedule every future match (date/time/venue)
-- from rule-based config, while still allowing manual overrides that survive
-- a full-phase reschedule.
--
-- scheduling_status:
--   'pending' -> no time yet (manual mode, awaiting admin)
--   'auto'    -> time assigned by the auto-scheduler (recomputable)
--   'manual'  -> admin set/changed the time (kept on reschedule)
--   'locked'  -> explicitly frozen (never recomputed)
--
-- Purely additive — safe to apply on top of the existing schema.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS auto_scheduled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS scheduling_status TEXT;

-- Backfill: existing bracket slots are still pending until scheduled.
UPDATE public.matches
   SET scheduling_status = 'pending'
 WHERE scheduling_status IS NULL
   AND bracket_match_code IS NOT NULL;
