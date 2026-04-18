BEGIN;

-- `external_teams` was created early in the project and later dropped during
-- schema simplification. Public routes still read from it for team logo
-- overrides, so a clean production deploy needs the table back.
CREATE TABLE IF NOT EXISTS public.external_teams (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'flashscore',
    name TEXT NOT NULL,
    short_name TEXT,
    logo_url TEXT,
    sport TEXT DEFAULT 'rugby',
    country TEXT,
    team_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.external_teams
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS short_name TEXT,
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS sport TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS team_url TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.external_teams
    ALTER COLUMN source SET DEFAULT 'flashscore',
    ALTER COLUMN sport SET DEFAULT 'rugby',
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW(),
    ALTER COLUMN last_fetched_at SET DEFAULT NOW();

UPDATE public.external_teams
SET
    source = COALESCE(NULLIF(BTRIM(source), ''), 'flashscore'),
    sport = COALESCE(NULLIF(BTRIM(sport), ''), 'rugby'),
    updated_at = COALESCE(updated_at, NOW()),
    created_at = COALESCE(created_at, NOW()),
    last_fetched_at = COALESCE(last_fetched_at, updated_at, NOW())
WHERE
    source IS NULL
    OR BTRIM(source) = ''
    OR sport IS NULL
    OR BTRIM(sport) = ''
    OR updated_at IS NULL
    OR created_at IS NULL
    OR last_fetched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_external_teams_source_id
    ON public.external_teams(source, id);

CREATE INDEX IF NOT EXISTS idx_external_teams_sport
    ON public.external_teams(sport);

CREATE INDEX IF NOT EXISTS idx_external_teams_team_url
    ON public.external_teams(team_url);

ALTER TABLE public.external_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "External teams are viewable by everyone"
    ON public.external_teams;
DROP POLICY IF EXISTS external_teams_select
    ON public.external_teams;
CREATE POLICY external_teams_select
    ON public.external_teams
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Only authenticated users can insert external teams"
    ON public.external_teams;
DROP POLICY IF EXISTS external_teams_insert
    ON public.external_teams;
CREATE POLICY external_teams_insert
    ON public.external_teams
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only authenticated users can update external teams"
    ON public.external_teams;
DROP POLICY IF EXISTS external_teams_update
    ON public.external_teams;
CREATE POLICY external_teams_update
    ON public.external_teams
    FOR UPDATE
    TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';

COMMIT;
