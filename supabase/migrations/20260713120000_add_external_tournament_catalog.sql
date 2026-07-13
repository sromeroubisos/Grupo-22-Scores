-- Searchable catalog of external (provider) tournaments.
--
-- The provider has no search endpoint (/search returns 404), so external tournaments
-- were invisible to the global search: only rows in `tournaments` (local) could ever
-- match. This table is the index we build ourselves, fed automatically from the
-- matches feed the home page already fetches.
--
-- Distinct from `external_tournaments`, which is a small hand-curated set of ADMIN
-- OVERRIDES (display_name, logo, priority) and also feeds the prode competition
-- picker — auto-discovered rows must not leak into that.
--
-- Keyed by the provider tournament URL: the feed emits one entry per STAGE
-- ("… - Play Offs", "… - 9th-12th places"), each with its own id, and the URL is the
-- only field every stage of a competition shares.

CREATE TABLE IF NOT EXISTS public.external_tournament_catalog (
    url TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,             -- id the UI links to: fs-<stage id>
    provider TEXT NOT NULL DEFAULT 'flashscore',
    name TEXT NOT NULL,                 -- competition name, stage suffix stripped
    country TEXT,
    sport TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_tournament_catalog_sport
    ON public.external_tournament_catalog(sport);

CREATE INDEX IF NOT EXISTS idx_external_tournament_catalog_name
    ON public.external_tournament_catalog(lower(name));

ALTER TABLE public.external_tournament_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "External tournament catalog is viewable by everyone"
    ON public.external_tournament_catalog;
CREATE POLICY "External tournament catalog is viewable by everyone"
    ON public.external_tournament_catalog FOR SELECT
    USING (true);

-- Writes come from the server via the service role, which bypasses RLS. No INSERT or
-- UPDATE policy is granted, so anon/authenticated clients cannot poison the catalog.
