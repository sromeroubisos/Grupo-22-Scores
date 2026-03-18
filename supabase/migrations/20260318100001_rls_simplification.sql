-- ============================================
-- RLS SIMPLIFICATION FOR CORE MODELS
-- ============================================

-- START TRANSACTION
BEGIN;

-- 1. UTILITY: Re-ensure the admin check helper exists and is robust (Copied from previous fix for safety)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    -- Roles allowed to manage data: super_admin, admin_general, admin, operator
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'admin_general', 'admin', 'operator')
    );
$$;

-- 2. APPLY RLS TO CORE TABLES
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

-- 3. RESET POLICIES (Safety clear)
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

-- 4. CORE POLICIES: PUBLIC READ
-- (These policies follow the simplified visibility rules)

-- Sports
CREATE POLICY "public_read_sports" ON public.sports FOR SELECT USING (is_visible = true);

-- Countries (Always public)
CREATE POLICY "public_read_countries" ON public.countries FOR SELECT USING (true);

-- Unions
CREATE POLICY "public_read_unions" ON public.unions FOR SELECT USING (true); -- Usually public

-- Clubs
CREATE POLICY "public_read_clubs" ON public.clubs FOR SELECT USING (is_visible = true);

-- Tournaments (Only active/published)
CREATE POLICY "public_read_tournaments" ON public.tournaments FOR SELECT USING (status IN ('active', 'published') AND is_visible = true);

-- Tournament Components (Phases, Groups, Rounds, Participants, Standings)
-- Generally public if the tournament is public
CREATE POLICY "public_read_tournament_phases" ON public.tournament_phases FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_groups" ON public.tournament_groups FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_rounds" ON public.tournament_rounds FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_participants" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "public_read_tournament_standings" ON public.tournament_standings FOR SELECT USING (true);

-- Matches (Publicly visible)
CREATE POLICY "public_read_matches" ON public.matches FOR SELECT USING (true);

-- 5. CORE POLICIES: ADMIN MANAGEMENT
-- (Administrative roles can do everything)

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

-- 6. USER SPECIFIC POLICIES

-- Users
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Favorites
CREATE POLICY "user_own_favorites" ON public.favorites USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMIT;
