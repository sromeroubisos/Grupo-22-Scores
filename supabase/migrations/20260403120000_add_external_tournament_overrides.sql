-- ============================================
-- External Tournament Overrides
-- Persists editorial overrides for external tournaments and standings
-- so serverless deployments do not depend on local filesystem writes.
-- ============================================

CREATE TABLE IF NOT EXISTS public.external_tournaments (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'flashscore',
    name TEXT NOT NULL,
    display_name TEXT,
    logo_url TEXT,
    sport TEXT DEFAULT 'rugby',
    country TEXT,
    country_id TEXT,
    url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_tournaments_source_id
    ON public.external_tournaments(source, id);

CREATE INDEX IF NOT EXISTS idx_external_tournaments_sport
    ON public.external_tournaments(sport);

ALTER TABLE public.external_tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "External tournaments are viewable by everyone"
    ON public.external_tournaments;
CREATE POLICY "External tournaments are viewable by everyone"
    ON public.external_tournaments FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Only authenticated users can insert external tournaments"
    ON public.external_tournaments;
CREATE POLICY "Only authenticated users can insert external tournaments"
    ON public.external_tournaments FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only authenticated users can update external tournaments"
    ON public.external_tournaments;
CREATE POLICY "Only authenticated users can update external tournaments"
    ON public.external_tournaments FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.external_tournament_standings_overrides (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'external-api',
    groups JSONB NOT NULL DEFAULT '[]'::jsonb,
    assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_tournament_standings_overrides_source_id
    ON public.external_tournament_standings_overrides(source, id);

ALTER TABLE public.external_tournament_standings_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "External tournament standings overrides are viewable by everyone"
    ON public.external_tournament_standings_overrides;
CREATE POLICY "External tournament standings overrides are viewable by everyone"
    ON public.external_tournament_standings_overrides FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Only authenticated users can insert external tournament standings overrides"
    ON public.external_tournament_standings_overrides;
CREATE POLICY "Only authenticated users can insert external tournament standings overrides"
    ON public.external_tournament_standings_overrides FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only authenticated users can update external tournament standings overrides"
    ON public.external_tournament_standings_overrides;
CREATE POLICY "Only authenticated users can update external tournament standings overrides"
    ON public.external_tournament_standings_overrides FOR UPDATE
    USING (auth.role() = 'authenticated');
