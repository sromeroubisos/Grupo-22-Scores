ALTER TABLE public.matches_feed_cache
    ADD COLUMN IF NOT EXISTS fresh_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stale_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payload_size_bytes INTEGER;

UPDATE public.matches_feed_cache
SET
    fresh_until = COALESCE(fresh_until, expires_at),
    stale_until = COALESCE(stale_until, expires_at),
    payload_size_bytes = COALESCE(payload_size_bytes, pg_column_size(payload_json))
WHERE
    fresh_until IS NULL
    OR stale_until IS NULL
    OR payload_size_bytes IS NULL;

CREATE INDEX IF NOT EXISTS mfc_stale_until_idx
    ON public.matches_feed_cache (stale_until);
