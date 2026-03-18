-- ============================================
-- SCHEMA HARDENING V1: INDICES, UNIQUENESS & INTEGRITY
-- ============================================

BEGIN;

-- 1. PERFORMANCE: ADD MISSING INDICES ON FOREIGN KEYS
-- Postgres does not index FKs by default. These are critical for joins.

-- Sports
CREATE INDEX IF NOT EXISTS idx_sports_display_order ON public.sports(display_order);
CREATE INDEX IF NOT EXISTS idx_sports_is_visible ON public.sports(is_visible);

-- Clubs
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'sport_id') THEN
        CREATE INDEX IF NOT EXISTS idx_clubs_sport_id ON public.clubs(sport_id);
    END IF;
END $$;

-- Tournaments
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'sport_id') THEN
        CREATE INDEX IF NOT EXISTS idx_tournaments_sport_id ON public.tournaments(sport_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_tournaments_country_id ON public.tournaments(country_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_visible ON public.tournaments(is_visible);

-- Tournament Participants
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club_id ON public.tournament_participants(club_id);

-- Matches
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_club_id ON public.matches(home_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_club_id ON public.matches(away_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_date_time ON public.matches(date_time DESC);

-- Standings
CREATE INDEX IF NOT EXISTS idx_tournament_standings_lookup 
ON public.tournament_standings(tournament_id, phase_id, group_id, position);

-- 2. INTEGRITY: ADD COMPOSITE UNIQUE CONSTRAINTS
-- Prevent functional duplicates in the database.

-- Favorites
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_user_entity_unique;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_entity_unique UNIQUE (user_id, entity_type, entity_id);

-- Tournament Participants
ALTER TABLE public.tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_unique_entry;
ALTER TABLE public.tournament_participants ADD CONSTRAINT tournament_participants_unique_entry UNIQUE (tournament_id, club_id);

-- Tournament Standings
ALTER TABLE public.tournament_standings DROP CONSTRAINT IF EXISTS tournament_standings_unique_club;
ALTER TABLE public.tournament_standings ADD CONSTRAINT tournament_standings_unique_club UNIQUE (tournament_id, phase_id, group_id, club_id);

-- 3. BUSINESS LOGIC: CHECK CONSTRAINTS
-- Prevent invalid data from entering core tables.

-- Matches
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_clubs_not_same;
ALTER TABLE public.matches ADD CONSTRAINT matches_clubs_not_same CHECK (home_club_id IS NULL OR away_club_id IS NULL OR home_club_id <> away_club_id);

-- 4. NAMING STANDARDIZATION (REFINE BOOLEANS)
-- Ensuring consistency across the core schema.
-- (Already mostly handled in simplification, but reinforcing here if any were missed)

COMMIT;
