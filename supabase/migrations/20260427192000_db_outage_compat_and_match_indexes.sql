-- Emergency compatibility repair for April 27 DB outage.
-- Restores legacy columns still referenced by deployed code and adds match
-- indexes for club-dashboard lookups that filter by home/away club + date.

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE public.clubs
    ALTER COLUMN categories SET DEFAULT '{}'::TEXT[];

UPDATE public.clubs
SET categories = '{}'::TEXT[]
WHERE categories IS NULL;

UPDATE public.clubs
SET categories = ARRAY[category]
WHERE cardinality(COALESCE(categories, '{}'::TEXT[])) = 0
  AND NULLIF(category, '') IS NOT NULL;

ALTER TABLE public.clubs
    ALTER COLUMN categories SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_categories_gin
    ON public.clubs USING GIN (categories);

DO $$
BEGIN
    IF to_regclass('public.club_divisions') IS NOT NULL THEN
        ALTER TABLE public.club_divisions
            ADD COLUMN IF NOT EXISTS slug TEXT,
            ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'rugby',
            ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Masculino',
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS season TEXT,
            ADD COLUMN IF NOT EXISTS format TEXT,
            ADD COLUMN IF NOT EXISTS regulation TEXT;

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_club_divisions_club_featured_name
            ON public.club_divisions (club_id, featured DESC, name)';
    END IF;

    IF to_regclass('public.club_teams') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_club_teams_club_featured_name
            ON public.club_teams (club_id, featured DESC, name)';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_home_club_date_time
    ON public.matches (home_club_id, date_time);

CREATE INDEX IF NOT EXISTS idx_matches_away_club_date_time
    ON public.matches (away_club_id, date_time);

CREATE INDEX IF NOT EXISTS idx_matches_home_club_status_date_time
    ON public.matches (home_club_id, status, date_time DESC);

CREATE INDEX IF NOT EXISTS idx_matches_away_club_status_date_time
    ON public.matches (away_club_id, status, date_time DESC);

CREATE INDEX IF NOT EXISTS idx_matches_home_away_date_time
    ON public.matches (home_club_id, away_club_id, date_time DESC);

CREATE INDEX IF NOT EXISTS idx_matches_away_home_date_time
    ON public.matches (away_club_id, home_club_id, date_time DESC);
