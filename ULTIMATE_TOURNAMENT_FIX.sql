-- ============================================
-- ULTIMATE TOURNAMENT SCHEMA FIX
-- ============================================
-- This script safely creates or updates ALL tournament-related tables.
-- It handles dependencies (tournaments -> phases -> groups -> participants)
-- and reloads the schema cache.
-- ============================================

DO $$ 
BEGIN
    RAISE NOTICE 'Starting Comprehensive Tournament Schema Fix...';

    -- 1. VERIFY BASE TABLE
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tournaments') THEN
        RAISE EXCEPTION 'CRITICAL ERROR: The "tournaments" table does not exist. Please create it first.';
    END IF;
    RAISE NOTICE 'Step 1: "tournaments" table verified.';

    -- 2. CREATE/UPDATE tournament_phases
    CREATE TABLE IF NOT EXISTS public.tournament_phases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phase_type TEXT CHECK (phase_type IN ('league', 'knockout', 'group_stage', 'playoff')) DEFAULT 'league',
        order_index INT NOT NULL DEFAULT 0,
        start_date TIMESTAMPTZ,
        end_date TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT TRUE,
        settings JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id, order_index)
    );
    RAISE NOTICE 'Step 2: "tournament_phases" table created or verified.';

    -- 3. CREATE/UPDATE tournament_groups
    CREATE TABLE IF NOT EXISTS public.tournament_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        order_index INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(phase_id, name)
    );
    RAISE NOTICE 'Step 3: "tournament_groups" table created or verified.';

    -- 4. CREATE/UPDATE tournament_participants
    CREATE TABLE IF NOT EXISTS public.tournament_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
        club_id TEXT REFERENCES public.clubs(id) ON DELETE CASCADE,
        name TEXT,
        type TEXT CHECK (type IN ('club', 'national_team', 'franchise', 'invited', 'individual')) DEFAULT 'club',
        status TEXT CHECK (status IN ('active', 'inactive', 'pending', 'disqualified', 'withdrawn')) DEFAULT 'active',
        seed INT,
        group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
        short_code TEXT,
        notes TEXT,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Ensure columns exist if table was already there
    ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS type TEXT;
    ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS short_code TEXT;
    ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Step 4: "tournament_participants" table created or verified.';

    -- 5. CREATE/UPDATE tournament_rounds (Needed for Fixtures)
    CREATE TABLE IF NOT EXISTS public.tournament_rounds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        order_index INT NOT NULL DEFAULT 0,
        start_date TIMESTAMPTZ,
        end_date TIMESTAMPTZ,
        is_completed BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(phase_id, order_index)
    );
    RAISE NOTICE 'Step 5: "tournament_rounds" table created or verified.';

    -- 6. SETUP RLS & GRANTS
    ALTER TABLE public.tournament_phases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;

    RAISE NOTICE 'Step 6: RLS enabled for all tables.';
END $$;

-- 7. POLICIES (Must be outside DO block)
-- Public Access
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_phases') THEN
        CREATE POLICY "public_read_phases" ON public.tournament_phases FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_groups') THEN
        CREATE POLICY "public_read_groups" ON public.tournament_groups FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_participants') THEN
        CREATE POLICY "public_read_participants" ON public.tournament_participants FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_rounds') THEN
        CREATE POLICY "public_read_rounds" ON public.tournament_rounds FOR SELECT USING (true);
    END IF;
END $$;

-- Authenticated Access
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_phases') THEN
        CREATE POLICY "auth_all_phases" ON public.tournament_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_groups') THEN
        CREATE POLICY "auth_all_groups" ON public.tournament_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_participants') THEN
        CREATE POLICY "auth_all_participants" ON public.tournament_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_rounds') THEN
        CREATE POLICY "auth_all_rounds" ON public.tournament_rounds FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 8. PERMISSIONS
GRANT ALL ON public.tournament_phases TO authenticated;
GRANT ALL ON public.tournament_groups TO authenticated;
GRANT ALL ON public.tournament_participants TO authenticated;
GRANT ALL ON public.tournament_rounds TO authenticated;
GRANT SELECT ON public.tournament_phases TO anon;
GRANT SELECT ON public.tournament_groups TO anon;
GRANT SELECT ON public.tournament_participants TO anon;
GRANT SELECT ON public.tournament_rounds TO anon;

-- 9. RELOAD POSTGREST CACHE
NOTIFY pgrst, 'reload schema';

SELECT '🚀 READY! All tournament tables (phases, groups, participants, rounds) are set up. Wait 5 seconds.' AS message;
