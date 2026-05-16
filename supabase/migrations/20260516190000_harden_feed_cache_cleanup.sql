-- Harden persisted feed cache cleanup under write load.
--
-- The app invalidates public feed snapshots after match/tournament changes.
-- Under concurrent writes, the previous cleanup RPC could wait on locked rows
-- and hit Postgres statement_timeout. Keep each sweep small, index the exact
-- cleanup order, and skip rows that are currently locked by another writer.

CREATE INDEX IF NOT EXISTS mfc_cleanup_expiry_cache_key_idx
    ON public.matches_feed_cache ((COALESCE(stale_until, expires_at)), cache_key);

CREATE INDEX IF NOT EXISTS tfc_cleanup_expiry_cache_key_idx
    ON public.tournaments_feed_cache ((COALESCE(stale_until, expires_at)), cache_key);

CREATE OR REPLACE FUNCTION public.delete_expired_matches_feed_cache(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000));
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('matches_feed_cache_cleanup')) THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT cache_key
    FROM public.matches_feed_cache
    WHERE COALESCE(stale_until, expires_at) < NOW()
    ORDER BY COALESCE(stale_until, expires_at), cache_key
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
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

CREATE OR REPLACE FUNCTION public.delete_expired_tournaments_feed_cache(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000));
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tournaments_feed_cache_cleanup')) THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT cache_key
    FROM public.tournaments_feed_cache
    WHERE COALESCE(stale_until, expires_at) < NOW()
    ORDER BY COALESCE(stale_until, expires_at), cache_key
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
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
