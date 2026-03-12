-- ============================================
-- URGENT FIX: Execute this in Supabase SQL Editor NOW
-- ============================================
-- Copy this ENTIRE file and paste it into Supabase SQL Editor
-- Then click RUN
-- ============================================

-- Create the table with all required fields
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club ON public.tournament_participants(club_id);

-- Enable RLS
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "public_read_participants" ON public.tournament_participants;
CREATE POLICY "public_read_participants" ON public.tournament_participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "authenticated_all_participants" ON public.tournament_participants;
CREATE POLICY "authenticated_all_participants" ON public.tournament_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.tournament_participants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournament_participants TO authenticated;

-- RELOAD THE SCHEMA CACHE (THIS IS CRITICAL!)
NOTIFY pgrst, 'reload schema';

-- Verify it worked
SELECT 'SUCCESS! Table created. Wait 5 seconds then try creating a participant.' AS message;
