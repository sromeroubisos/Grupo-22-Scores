-- =====================================================================
-- Performance fix for club-admin matches tab
-- 1. Partial indexes for fast club + status + date lookups
-- 2. Partial indexes for tournament-scoped matches
-- 3. Denormalized count columns to avoid heavy JSONB parsing in list views
-- 4. Backfill existing rows
-- =====================================================================

BEGIN;

-- ── Partial indexes: final matches by club (used by dashboard counts & past queries) ──
CREATE INDEX IF NOT EXISTS idx_matches_home_club_final_date
    ON public.matches (home_club_id, status, date_time DESC)
    WHERE status IN ('final', 'finished', 'ft');

CREATE INDEX IF NOT EXISTS idx_matches_away_club_final_date
    ON public.matches (away_club_id, status, date_time DESC)
    WHERE status IN ('final', 'finished', 'ft');

-- ── Partial indexes: tournament matches by club ──
CREATE INDEX IF NOT EXISTS idx_matches_home_club_tournament_date
    ON public.matches (home_club_id, tournament_id, date_time DESC)
    WHERE tournament_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_away_club_tournament_date
    ON public.matches (away_club_id, tournament_id, date_time DESC)
    WHERE tournament_id IS NOT NULL;

-- ── Partial indexes: upcoming matches by club ──
CREATE INDEX IF NOT EXISTS idx_matches_home_club_upcoming_date
    ON public.matches (home_club_id, date_time DESC)
    WHERE date_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_away_club_upcoming_date
    ON public.matches (away_club_id, date_time DESC)
    WHERE date_time IS NOT NULL;

-- ── Denormalized count columns (lightweight integers, no JSONB parsing needed) ──
ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS lineup_home_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lineup_away_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS events_count INTEGER DEFAULT 0;

-- Backfill from existing JSONB data
UPDATE public.matches
SET
    lineup_home_count = CASE
        WHEN jsonb_typeof(COALESCE(lineups, '{}'::jsonb)->'home') = 'array'
            THEN jsonb_array_length(COALESCE(lineups, '{}'::jsonb)->'home')
        ELSE 0
    END,
    lineup_away_count = CASE
        WHEN jsonb_typeof(COALESCE(lineups, '{}'::jsonb)->'away') = 'array'
            THEN jsonb_array_length(COALESCE(lineups, '{}'::jsonb)->'away')
        ELSE 0
    END,
    events_count = CASE
        WHEN jsonb_typeof(COALESCE(events, '[]'::jsonb)) = 'array'
            THEN jsonb_array_length(COALESCE(events, '[]'::jsonb))
        WHEN jsonb_typeof(COALESCE(events, '{}'::jsonb)) = 'object'
            THEN (
                SELECT COALESCE(SUM(
                    CASE WHEN jsonb_typeof(value) = 'array' THEN jsonb_array_length(value) ELSE 0 END
                ), 0)::INTEGER
                FROM jsonb_each(COALESCE(events, '{}'::jsonb))
            )
        ELSE 0
    END
WHERE lineup_home_count = 0
   AND lineup_away_count = 0
   AND events_count = 0;

-- ── Helper function: paginated club matches with opponent info ──
-- This lets the frontend fetch only what it needs instead of 150+ rows in one shot.
CREATE OR REPLACE FUNCTION public.get_club_matches_paginated(
    p_club_id TEXT,
    p_status_filter TEXT DEFAULT 'all',   -- 'all' | 'upcoming' | 'played'
    p_cursor TIMESTAMPTZ DEFAULT NULL,     -- pagination cursor (date_time)
    p_limit INTEGER DEFAULT 25,
    p_direction TEXT DEFAULT 'desc'        -- 'desc' | 'asc'
)
RETURNS TABLE (
    id UUID,
    date_time TIMESTAMPTZ,
    status TEXT,
    venue TEXT,
    score JSONB,
    notes TEXT,
    tournament_id UUID,
    home_club_id TEXT,
    away_club_id TEXT,
    home_division_id UUID,
    away_division_id UUID,
    lineup_home_count INTEGER,
    lineup_away_count INTEGER,
    events_count INTEGER,
    home_name TEXT,
    home_short_name TEXT,
    home_logo_url TEXT,
    home_slug TEXT,
    away_name TEXT,
    away_short_name TEXT,
    away_logo_url TEXT,
    away_slug TEXT,
    tournament_name TEXT,
    tournament_slug TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        m.id,
        m.date_time,
        m.status,
        m.venue,
        m.score,
        m.notes,
        m.tournament_id,
        m.home_club_id,
        m.away_club_id,
        m.home_division_id,
        m.away_division_id,
        m.lineup_home_count,
        m.lineup_away_count,
        m.events_count,
        hc.name AS home_name,
        hc.short_name AS home_short_name,
        hc.logo_url AS home_logo_url,
        hc.slug AS home_slug,
        ac.name AS away_name,
        ac.short_name AS away_short_name,
        ac.logo_url AS away_logo_url,
        ac.slug AS away_slug,
        t.name AS tournament_name,
        t.slug AS tournament_slug
    FROM public.matches m
    LEFT JOIN public.clubs hc ON hc.id = m.home_club_id
    LEFT JOIN public.clubs ac ON ac.id = m.away_club_id
    LEFT JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE
        (m.home_club_id = p_club_id OR m.away_club_id = p_club_id)
        AND (
            p_status_filter = 'all'
            OR (
                p_status_filter = 'upcoming'
                AND m.date_time >= NOW()
                AND m.status NOT IN ('final', 'finished', 'ft')
            )
            OR (
                p_status_filter = 'played'
                AND m.status IN ('final', 'finished', 'ft')
            )
        )
        AND (
            p_cursor IS NULL
            OR (
                p_direction = 'desc' AND m.date_time < p_cursor
            )
            OR (
                p_direction = 'asc' AND m.date_time > p_cursor
            )
        )
    ORDER BY
        CASE WHEN p_direction = 'desc' THEN m.date_time END DESC,
        CASE WHEN p_direction = 'asc' THEN m.date_time END ASC
    LIMIT LEAST(p_limit, 100);
$$;

COMMENT ON FUNCTION public.get_club_matches_paginated IS
    'Paginated, lightweight match list for club-admin. No heavy JSONB blobs.';

COMMIT;
