-- ============================================
-- Sofascore Stats Cache
-- Populated by scripts/sofascore/scrape_stats.py via service_role (bypasses RLS).
-- Read by /api/sofascore/* endpoints.
-- ============================================

-- Catalog of (league, season) pairs scraped, plus refresh metadata.
CREATE TABLE IF NOT EXISTS public.sofascore_seasons (
    league_key       TEXT NOT NULL,           -- e.g. "argentina-liga-profesional"
    league_name      TEXT NOT NULL,           -- e.g. "Argentina Liga Profesional"
    season_year      TEXT NOT NULL,           -- e.g. "2026"
    season_id        BIGINT NOT NULL,         -- Sofascore season id
    last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_status      TEXT,                    -- ok | error | partial
    last_error       TEXT,
    PRIMARY KEY (league_key, season_year)
);

CREATE INDEX IF NOT EXISTS sofascore_seasons_refreshed_idx
    ON public.sofascore_seasons (last_refreshed_at DESC);

-- Aggregated team stats for a (league, season).
CREATE TABLE IF NOT EXISTS public.sofascore_team_stats (
    league_key   TEXT NOT NULL,
    season_year  TEXT NOT NULL,
    team_id      BIGINT NOT NULL,             -- Sofascore team id
    team_name    TEXT NOT NULL,
    stats        JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (league_key, season_year, team_id),
    FOREIGN KEY (league_key, season_year)
        REFERENCES public.sofascore_seasons (league_key, season_year)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sofascore_team_stats_lookup_idx
    ON public.sofascore_team_stats (league_key, season_year);

-- Aggregated player stats for a (league, season).
CREATE TABLE IF NOT EXISTS public.sofascore_player_stats (
    league_key   TEXT NOT NULL,
    season_year  TEXT NOT NULL,
    player_id    BIGINT NOT NULL,             -- Sofascore player id
    player_name  TEXT NOT NULL,
    team_id      BIGINT,
    team_name    TEXT,
    position     TEXT,
    stats        JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (league_key, season_year, player_id),
    FOREIGN KEY (league_key, season_year)
        REFERENCES public.sofascore_seasons (league_key, season_year)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sofascore_player_stats_lookup_idx
    ON public.sofascore_player_stats (league_key, season_year);

CREATE INDEX IF NOT EXISTS sofascore_player_stats_team_idx
    ON public.sofascore_player_stats (league_key, season_year, team_id);

-- ============================================
-- RLS: public read, writes only via service_role
-- ============================================
ALTER TABLE public.sofascore_seasons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sofascore_team_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sofascore_player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sofascore_seasons_public_read" ON public.sofascore_seasons;
CREATE POLICY "sofascore_seasons_public_read" ON public.sofascore_seasons
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "sofascore_team_stats_public_read" ON public.sofascore_team_stats;
CREATE POLICY "sofascore_team_stats_public_read" ON public.sofascore_team_stats
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "sofascore_player_stats_public_read" ON public.sofascore_player_stats;
CREATE POLICY "sofascore_player_stats_public_read" ON public.sofascore_player_stats
    FOR SELECT USING (TRUE);
