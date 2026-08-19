-- ============================================================================
-- SINGLE ACTIVE PHASE PER (tournament, season)
-- ----------------------------------------------------------------------------
-- The API deactivates sibling phases before activating a new one, so at the
-- application layer there is never more than one active phase per season. But
-- that guarantee lives only in code ordering: a crash between the two writes,
-- a stray manual UPDATE, or a legacy row from before that ordering existed can
-- still leave two phases with is_active = TRUE, which corrupts standings
-- scoping (the standings engine picks "the" active phase).
--
-- This migration makes the invariant structural. It mirrors the existing
-- `tournament_seasons_one_active_idx` precedent, extended to (tournament_id,
-- season_id) because a tournament can run several seasons, each with its own
-- active phase.
--
-- season_id is nullable (phases predating the seasons model, or tournaments
-- without an explicit season). NULLs are distinct in a plain unique index, so
-- two null-season active phases would slip through — COALESCE folds them onto
-- a fixed sentinel so they share the constraint per tournament.
--
-- Safe to run repeatedly: the cleanup is idempotent and the index uses
-- IF NOT EXISTS.
-- ============================================================================

-- 1) Reconcile any pre-existing duplicates BEFORE adding the index, otherwise
--    CREATE UNIQUE INDEX would abort on rows that already violate it. Keep the
--    earliest phase active (lowest order_index) — the same phase the DELETE
--    promotion logic would choose — and deactivate the rest of the group.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY
                tournament_id,
                COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY order_index ASC, created_at ASC, id ASC
        ) AS rn
    FROM public.tournament_phases
    WHERE is_active = TRUE
)
UPDATE public.tournament_phases AS p
SET is_active = FALSE,
    updated_at = NOW()
FROM ranked
WHERE p.id = ranked.id
  AND ranked.rn > 1;

-- 2) Enforce the invariant. Partial unique index: only active rows are indexed,
--    so inactive phases are unconstrained and the deactivate-then-activate
--    ordering in the API composes cleanly (zero active for an instant, never
--    two).
CREATE UNIQUE INDEX IF NOT EXISTS tournament_phases_one_active_idx
    ON public.tournament_phases (
        tournament_id,
        COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE is_active = TRUE;
