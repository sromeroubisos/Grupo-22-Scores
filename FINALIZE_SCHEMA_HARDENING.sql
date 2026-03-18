-- ============================================================================
-- GLOBAL SCHEMA HARDENING & UI SUPPORT (2026-03-18)
-- ============================================================================
-- 1. Combine multiple schema migrations into one to avoid push issues.
-- 2. Includes RLS simplification, hardening, relational events, and UI labels.
-- 3. Execute this via Supabase SQL Editor if 'npx supabase db push' fails.
-- ============================================================================

-- START GLOBAL TRANSACTION
BEGIN;

--------------------------------------------------------------------------------
-- PART 1: RLS SIMPLIFICATION
--------------------------------------------------------------------------------

-- UTILITY: Re-ensure the admin check helper exists
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'admin_general', 'admin', 'operator')
    );
$$;

-- ENABLE RLS ON ALL CORE TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- RESET POLICIES (Safety clear)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
        'users', 'sports', 'countries', 'unions', 'clubs', 'tournaments', 
        'tournament_phases', 'tournament_groups', 'tournament_rounds', 
        'tournament_participants', 'matches', 'tournament_standings', 'favorites'
    ))
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "public_read_%I" ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "admin_all_%I" ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "user_own_%I" ON public.%I', t, t);
    END LOOP;
END $$;

-- PUBLIC READ POLICIES
CREATE POLICY "public_read_sports" ON public.sports FOR SELECT USING (is_visible = true);
CREATE POLICY "public_read_countries" ON public.countries FOR SELECT USING (true);
CREATE POLICY "public_read_unions" ON public.unions FOR SELECT USING (true);
CREATE POLICY "public_read_clubs" ON public.clubs FOR SELECT USING (is_visible = true);
CREATE POLICY "public_read_tournaments" ON public.tournaments FOR SELECT USING (status IN ('active', 'published') AND is_visible = true);
CREATE POLICY "public_read_tournament_phases" ON public.tournament_phases FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_groups" ON public.tournament_groups FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_rounds" ON public.tournament_rounds FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_participants" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_standings" ON public.tournament_standings FOR SELECT USING (true);
CREATE POLICY "public_read_matches" ON public.matches FOR SELECT USING (true);

-- ADMIN MANAGEMENT POLICIES
DO $$
DECLARE
    t TEXT;
    target_tables TEXT[] := ARRAY[
        'sports', 'countries', 'unions', 'clubs', 'tournaments', 
        'tournament_phases', 'tournament_groups', 'tournament_rounds', 
        'tournament_participants', 'matches', 'tournament_standings'
    ];
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        EXECUTE format('CREATE POLICY "admin_all_%I" ON public.%I FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())', t, t);
    END LOOP;
END $$;

-- USER SPECIFIC POLICIES
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id OR public.is_admin());
DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "user_own_favorites" ON public.favorites USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- PART 2: SCHEMA HARDENING (INDICES & CONSTRAINTS)
--------------------------------------------------------------------------------

-- MISSING INDICES ON FOREIGN KEYS
CREATE INDEX IF NOT EXISTS idx_sports_display_order ON public.sports(display_order);
CREATE INDEX IF NOT EXISTS idx_sports_is_visible ON public.sports(is_visible);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'sport_id') THEN
        CREATE INDEX IF NOT EXISTS idx_clubs_sport_id ON public.clubs(sport_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'sport_id') THEN
        CREATE INDEX IF NOT EXISTS idx_tournaments_sport_id ON public.tournaments(sport_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_tournaments_country_id ON public.tournaments(country_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_visible ON public.tournaments(is_visible);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club_id ON public.tournament_participants(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_club_id ON public.matches(home_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_club_id ON public.matches(away_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_date_time ON public.matches(date_time DESC);

-- COMPOSITE UNIQUE CONSTRAINTS
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_user_entity_unique;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_entity_unique UNIQUE (user_id, entity_type, entity_id);
ALTER TABLE public.tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_unique_entry;
ALTER TABLE public.tournament_participants ADD CONSTRAINT tournament_participants_unique_entry UNIQUE (tournament_id, club_id);
ALTER TABLE public.tournament_standings DROP CONSTRAINT IF EXISTS tournament_standings_unique_club;
ALTER TABLE public.tournament_standings ADD CONSTRAINT tournament_standings_unique_club UNIQUE (tournament_id, phase_id, group_id, club_id);

-- CHECK CONSTRAINTS
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_clubs_not_same;
ALTER TABLE public.matches ADD CONSTRAINT matches_clubs_not_same CHECK (home_club_id IS NULL OR away_club_id IS NULL OR home_club_id <> away_club_id);

--------------------------------------------------------------------------------
-- PART 3: RELATIONAL MATCH EVENTS
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.match_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    club_id TEXT REFERENCES public.clubs(id),
    player_id UUID,
    player_name TEXT,
    event_type TEXT NOT NULL,
    minute INTEGER,
    second INTEGER,
    extra_time INTEGER,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON public.match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON public.match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_club_id ON public.match_events(club_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON public.match_events(event_type);

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read match events" ON public.match_events;
CREATE POLICY "Public can read match events" ON public.match_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage match events" ON public.match_events;
CREATE POLICY "Admins can manage match events" ON public.match_events FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

--------------------------------------------------------------------------------
-- PART 4: COMPOSITE PERFORMANCE INDICES
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_matches_tournament_phase_group_datetime 
  ON public.matches (tournament_id, phase_id, group_id, date_time);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_round 
  ON public.matches (tournament_id, round_uuid);
CREATE INDEX IF NOT EXISTS idx_standings_tournament_phase_group_position 
  ON public.tournament_standings (tournament_id, phase_id, group_id, position);
CREATE INDEX IF NOT EXISTS idx_participants_tournament_club 
  ON public.tournament_participants (tournament_id, club_id);
CREATE INDEX IF NOT EXISTS idx_groups_phase 
  ON public.tournament_groups (phase_id);
CREATE INDEX IF NOT EXISTS idx_rounds_phase 
  ON public.tournament_rounds (phase_id);

--------------------------------------------------------------------------------
-- PART 5: MATCH POINTS FIELDS
--------------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_base_points       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_base_points       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_bonus_points      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_bonus_points      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_autocalculated  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS points_override_reason text;

--------------------------------------------------------------------------------
-- PART 6: UI LABELS SYSTEM (THE FIX)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ui_labels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'standings',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_labels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id      UUID NOT NULL REFERENCES public.ui_labels(id) ON DELETE CASCADE,
  club_id       TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  phase_id      UUID REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
  group_id      UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (label_id, club_id, tournament_id, phase_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_team_labels_club ON public.team_labels (club_id);
CREATE INDEX IF NOT EXISTS idx_team_labels_tournament ON public.team_labels (tournament_id, phase_id, group_id);
CREATE INDEX IF NOT EXISTS idx_team_labels_label ON public.team_labels (label_id);

ALTER TABLE public.ui_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ui_labels_read" ON public.ui_labels FOR SELECT USING (true);
CREATE POLICY "team_labels_read" ON public.team_labels FOR SELECT USING (true);
CREATE POLICY "ui_labels_write" ON public.ui_labels FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "team_labels_write" ON public.team_labels FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


--------------------------------------------------------------------------------
-- FINALIZE
--------------------------------------------------------------------------------

COMMIT;

-- RELOAD CACHE
SELECT 'Schema updated successfully!' AS status;
NOTIFY pgrst, 'reload schema';
