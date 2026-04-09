-- matches_feed_cache: persisted public feed snapshots for /api/matches
-- Used as:
--   (1) daily feed snapshot for date + sport + timezone combinations
--   (2) live feed snapshot for hot live polling keys
--   (3) fallback layer between in-memory endpoint cache and full recomputation

CREATE TABLE IF NOT EXISTS public.matches_feed_cache (
    cache_key                   TEXT PRIMARY KEY,
    feed_type                   TEXT NOT NULL, -- daily | live
    sport                       TEXT,
    effective_date              DATE,
    time_zone                   TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    status_filter               TEXT,
    external_mode               BOOLEAN NOT NULL DEFAULT TRUE,
    payload_json                JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_summary              JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ NOT NULL,
    last_refresh_started_at     TIMESTAMPTZ,
    last_refresh_completed_at   TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mfc_feed_lookup_idx
    ON public.matches_feed_cache (feed_type, sport, effective_date, time_zone);

CREATE INDEX IF NOT EXISTS mfc_expires_at_idx
    ON public.matches_feed_cache (expires_at);

DROP TRIGGER IF EXISTS matches_feed_cache_updated_at ON public.matches_feed_cache;
CREATE TRIGGER matches_feed_cache_updated_at
    BEFORE UPDATE ON public.matches_feed_cache
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.matches_feed_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mfc_public_read" ON public.matches_feed_cache;
CREATE POLICY "mfc_public_read" ON public.matches_feed_cache
    FOR SELECT USING (TRUE);

-- Writes are performed via service_role (createAdminClient), which bypasses RLS.
