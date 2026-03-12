-- ============================================
-- CONSOLIDATED FIX: Tournament Management Tables
-- ============================================
-- This script creates all necessary tables in the correct order:
-- 1. tournament_phases
-- 2. tournament_groups
-- 3. tournament_participants
-- ============================================

-- ─── 1. PHASES / STAGES ─────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_tournament_phases_tournament ON public.tournament_phases(tournament_id, order_index);

-- ─── 2. GROUPS / ZONES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phase_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tournament_groups_phase ON public.tournament_groups(phase_id);

-- ─── 3. PARTICIPANTS ────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club ON public.tournament_participants(club_id);

-- ─── 4. RLS & PERMISSIONS ──────────────────────────────────────────────────
ALTER TABLE public.tournament_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- Public read
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
END $$;

-- Authenticated full access
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_phases') THEN
        CREATE POLICY "authenticated_all_phases" ON public.tournament_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_groups') THEN
        CREATE POLICY "authenticated_all_groups" ON public.tournament_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_participants') THEN
        CREATE POLICY "authenticated_all_participants" ON public.tournament_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.tournament_phases TO authenticated;
GRANT ALL ON public.tournament_groups TO authenticated;
GRANT ALL ON public.tournament_participants TO authenticated;
GRANT SELECT ON public.tournament_phases TO anon;
GRANT SELECT ON public.tournament_groups TO anon;
GRANT SELECT ON public.tournament_participants TO anon;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

SELECT '✅ SUCCESS! All tournament tables created with dependencies. Wait 5 seconds.' AS message;
