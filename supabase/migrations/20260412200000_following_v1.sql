-- V1 following system for public users.
-- Keeps sports preferences intact and restores targeted follows for leagues/tournaments and clubs.

CREATE TABLE IF NOT EXISTS public.user_favorite_leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,
    sport_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_favorite_leagues
    ADD COLUMN IF NOT EXISTS canonical_league_id TEXT,
    ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_favorite_leagues_user_id_league_id_key'
          AND conrelid = 'public.user_favorite_leagues'::regclass
    ) THEN
        ALTER TABLE public.user_favorite_leagues
            ADD CONSTRAINT user_favorite_leagues_user_id_league_id_key
            UNIQUE (user_id, league_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_favorite_clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL,
    canonical_club_id TEXT,
    sport_id TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_user_id ON public.user_favorite_leagues(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_sport_id ON public.user_favorite_leagues(sport_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_user_sort ON public.user_favorite_leagues(user_id, sort_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_canonical ON public.user_favorite_leagues(canonical_league_id);

CREATE INDEX IF NOT EXISTS idx_user_favorite_clubs_user_id ON public.user_favorite_clubs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_clubs_sport_id ON public.user_favorite_clubs(sport_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_clubs_user_sort ON public.user_favorite_clubs(user_id, sort_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_favorite_clubs_canonical ON public.user_favorite_clubs(canonical_club_id);

ALTER TABLE public.user_favorite_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorite_clubs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users manage own favorite leagues" ON public.user_favorite_leagues;
    DROP POLICY IF EXISTS "Users manage own favorite clubs" ON public.user_favorite_clubs;
END $$;

CREATE POLICY "Users manage own favorite leagues"
    ON public.user_favorite_leagues
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own favorite clubs"
    ON public.user_favorite_clubs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
