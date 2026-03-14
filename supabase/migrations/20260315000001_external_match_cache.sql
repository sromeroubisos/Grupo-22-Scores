-- external_match_cache: lightweight Supabase table for FlashScore match data
-- Used as:
--   (1) hourly fixture cache (refreshed by /api/cron/fixture-sync)
--   (2) live match state persistence (refreshed every minute by /api/cron/live-sync)
--   (3) API fallback when FlashScore is unavailable

CREATE TABLE IF NOT EXISTS public.external_match_cache (
    id              TEXT PRIMARY KEY,           -- FlashScore ID, e.g. 'fs-12345'
    sport           TEXT NOT NULL,
    tournament_id   TEXT,
    tournament_name TEXT,
    country_name    TEXT,
    home_team       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { id, name, logo, shortName }
    away_team       JSONB NOT NULL DEFAULT '{}'::jsonb,
    score           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { home, away }
    status          TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled | live | final | postponed
    date_time       TIMESTAMPTZ NOT NULL,
    round_label     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS emc_sport_date_idx
    ON public.external_match_cache (sport, date_time);

CREATE INDEX IF NOT EXISTS emc_status_updated_idx
    ON public.external_match_cache (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS emc_tournament_idx
    ON public.external_match_cache (tournament_id);

-- Auto-update updated_at on row changes
-- Note: set_updated_at() already exists (created in migration 20260219300000_club_divisions_venues.sql)
DROP TRIGGER IF EXISTS external_match_cache_updated_at ON public.external_match_cache;
CREATE TRIGGER external_match_cache_updated_at
    BEFORE UPDATE ON public.external_match_cache
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.external_match_cache ENABLE ROW LEVEL SECURITY;

-- Public read: anon key used by API routes can read fallback data
DROP POLICY IF EXISTS "emc_public_read" ON public.external_match_cache;
CREATE POLICY "emc_public_read" ON public.external_match_cache
    FOR SELECT USING (TRUE);

-- Writes are performed via service_role (createAdminClient) which bypasses RLS entirely.
-- No explicit INSERT/UPDATE policy needed — service_role is exempt.
