-- ============================================
-- External Teams Cache
-- Stores team logos and basic info from external sources (FlashScore, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS public.external_teams (
    id TEXT PRIMARY KEY, -- External ID (e.g., '2aBj1cCr' from FlashScore)
    source TEXT NOT NULL DEFAULT 'flashscore', -- Source of the data
    name TEXT NOT NULL,
    short_name TEXT,
    logo_url TEXT,
    sport TEXT CHECK (sport IN ('rugby', 'football', 'hockey', 'basketball', 'volleyball', 'tennis')) DEFAULT 'rugby',
    country TEXT,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_external_teams_source_id ON public.external_teams(source, id);
CREATE INDEX IF NOT EXISTS idx_external_teams_sport ON public.external_teams(sport);

-- RLS Policies (read-only for authenticated users)
ALTER TABLE public.external_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "External teams are viewable by everyone"
    ON public.external_teams FOR SELECT
    USING (true);

-- Only super admins can insert/update
CREATE POLICY "Only authenticated users can insert external teams"
    ON public.external_teams FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update external teams"
    ON public.external_teams FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Function to upsert external team
CREATE OR REPLACE FUNCTION upsert_external_team(
    p_id TEXT,
    p_source TEXT,
    p_name TEXT,
    p_short_name TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_sport TEXT DEFAULT 'rugby',
    p_country TEXT DEFAULT NULL
)
RETURNS public.external_teams
LANGUAGE plpgsql
AS $$
DECLARE
    result public.external_teams;
BEGIN
    INSERT INTO public.external_teams (
        id, source, name, short_name, logo_url, sport, country, last_fetched_at
    )
    VALUES (
        p_id, p_source, p_name, p_short_name, p_logo_url, p_sport, p_country, NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        logo_url = EXCLUDED.logo_url,
        sport = EXCLUDED.sport,
        country = EXCLUDED.country,
        updated_at = NOW(),
        last_fetched_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$;
