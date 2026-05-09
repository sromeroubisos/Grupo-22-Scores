-- Fix statement_timeout on /rpc/delete_expired_matches_feed_cache and
-- /rpc/delete_expired_tournaments_feed_cache.
--
-- Root cause: the previous implementations filtered and ordered by
-- `coalesce(stale_until, expires_at)`. That expression cannot use either
-- `mfc_stale_until_idx` (on stale_until) or `mfc_expires_at_idx` (on
-- expires_at), so PostgreSQL fell back to a sequential scan + sort. As the
-- cache grew, this routinely exceeded the statement timeout — visible in the
-- DB logs as repeated `canceling statement due to statement timeout` events
-- on `/rpc/delete_expired_matches_feed_cache`.
--
-- Fix:
--   1. Backfill any remaining NULL stale_until / fresh_until rows from
--      expires_at, so the column is always populated.
--   2. Add an explicit functional fallback index so even legacy rows can
--      still be looked up cheaply if the backfill ever leaves gaps.
--   3. Rewrite the cleanup functions to filter and order by `stale_until`
--      (NULLS FIRST so legacy / never-backfilled rows still get pruned).
--      This lets the planner use `mfc_stale_until_idx` /
--      `tfc_stale_until_idx` directly.

-- 1. Re-run the backfill defensively (no-op if everything is already filled).
UPDATE public.matches_feed_cache
SET
    fresh_until = COALESCE(fresh_until, expires_at),
    stale_until = COALESCE(stale_until, expires_at)
WHERE
    fresh_until IS NULL
    OR stale_until IS NULL;

UPDATE public.tournaments_feed_cache
SET
    fresh_until = COALESCE(fresh_until, expires_at),
    stale_until = COALESCE(stale_until, expires_at)
WHERE
    fresh_until IS NULL
    OR stale_until IS NULL;

-- 2. Functional index as a safety net for the COALESCE-style lookups that
--    older code paths may still emit. Cheap to maintain (only stale_until
--    changes infrequently), and lets ad-hoc queries stay fast too.
CREATE INDEX IF NOT EXISTS mfc_cleanup_expiry_idx
    ON public.matches_feed_cache ((COALESCE(stale_until, expires_at)));

CREATE INDEX IF NOT EXISTS tfc_cleanup_expiry_idx
    ON public.tournaments_feed_cache ((COALESCE(stale_until, expires_at)));

-- 3. Rewrite the cleanup RPCs to filter/order on `stale_until` directly so
--    they can use the existing single-column indexes. Rows whose stale_until
--    is NULL (legacy data the backfill above did not catch) are sorted first
--    and still get deleted on their next sweep.
CREATE OR REPLACE FUNCTION public.delete_expired_matches_feed_cache(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('matches_feed_cache_cleanup')) THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT cache_key
    FROM public.matches_feed_cache
    WHERE stale_until IS NULL OR stale_until < NOW()
    ORDER BY stale_until NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  ),
  deleted AS (
    DELETE FROM public.matches_feed_cache m
    USING doomed
    WHERE m.cache_key = doomed.cache_key
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_expired_matches_feed_cache(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_expired_tournaments_feed_cache(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tournaments_feed_cache_cleanup')) THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT cache_key
    FROM public.tournaments_feed_cache
    WHERE stale_until IS NULL OR stale_until < NOW()
    ORDER BY stale_until NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  ),
  deleted AS (
    DELETE FROM public.tournaments_feed_cache t
    USING doomed
    WHERE t.cache_key = doomed.cache_key
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_expired_tournaments_feed_cache(integer) TO service_role;
