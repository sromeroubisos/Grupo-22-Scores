CREATE TABLE IF NOT EXISTS public.tournaments_feed_cache (
    cache_key                   TEXT PRIMARY KEY,
    feed_type                   TEXT NOT NULL, -- list | summary | country | db
    sport                       TEXT,
    scope                       TEXT,
    audience                    TEXT,
    search_query                TEXT,
    external_country_id         TEXT,
    payload_json                JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_summary              JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ NOT NULL,
    fresh_until                 TIMESTAMPTZ,
    stale_until                 TIMESTAMPTZ,
    payload_size_bytes          INTEGER,
    last_refresh_started_at     TIMESTAMPTZ,
    last_refresh_completed_at   TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tfc_feed_lookup_idx
    ON public.tournaments_feed_cache (feed_type, sport, scope);

CREATE INDEX IF NOT EXISTS tfc_stale_until_idx
    ON public.tournaments_feed_cache (stale_until);

DROP TRIGGER IF EXISTS tournaments_feed_cache_updated_at ON public.tournaments_feed_cache;
CREATE TRIGGER tournaments_feed_cache_updated_at
    BEFORE UPDATE ON public.tournaments_feed_cache
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tournaments_feed_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tfc_public_read" ON public.tournaments_feed_cache;
CREATE POLICY "tfc_public_read" ON public.tournaments_feed_cache
    FOR SELECT USING (TRUE);
