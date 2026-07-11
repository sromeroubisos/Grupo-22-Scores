-- Restore external_match_cache (C1 audit fix).
-- The table was created in 20260315000001_external_match_cache.sql and dropped by
-- 20260318100000_schema_simplification_core.sql, but the code paths that use it
-- (/api/cron/live-sync, /api/cron/fixture-sync, /api/matches fallback, prode sync)
-- were never removed. Recreate it 1:1 with the original definition, defensively.

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

-- Auto-update updated_at on row changes.
-- set_updated_at() was originally created in 20260219300000_club_divisions_venues.sql;
-- recreate it defensively in case it was dropped (same body, idempotent).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
