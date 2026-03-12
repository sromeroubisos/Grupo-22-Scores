-- ============================================
-- COMPREHENSIVE FIX: Tournament Participants Table
-- ============================================
-- This script fixes the "Could not find the table in the schema cache" error
-- Safe to run multiple times (idempotent)
--
-- What this does:
-- 1. Creates tournament_participants table if missing
-- 2. Adds all required columns
-- 3. Sets up proper constraints and indexes
-- 4. Configures RLS policies
-- 5. Reloads PostgREST schema cache
-- ============================================

-- ============================================
-- STEP 1: Ensure prerequisite tables exist
-- ============================================

-- Check if tournaments table exists (required for foreign key)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tournaments') THEN
        RAISE EXCEPTION 'tournaments table does not exist. Please create it first.';
    END IF;
END $$;

-- ============================================
-- STEP 2: Create or update tournament_participants table
-- ============================================

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT REFERENCES public.clubs(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    seed INT,
    status TEXT CHECK (status IN ('active', 'inactive', 'pending', 'disqualified', 'withdrawn')) DEFAULT 'active',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns (safe if they already exist)
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS type TEXT
    CHECK (type IN ('club', 'national_team', 'franchise', 'invited', 'individual'))
    DEFAULT 'club';

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS short_code TEXT;

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS country_name TEXT;

-- ============================================
-- STEP 3: Update constraints
-- ============================================

-- Drop old NOT NULL constraint on club_id (if exists)
ALTER TABLE public.tournament_participants
    ALTER COLUMN club_id DROP NOT NULL;

-- Update status constraint to include all valid values
DO $$ BEGIN
    ALTER TABLE public.tournament_participants
        DROP CONSTRAINT IF EXISTS tournament_participants_status_check;
    ALTER TABLE public.tournament_participants
        ADD CONSTRAINT tournament_participants_status_check
        CHECK (status IN ('active', 'inactive', 'pending', 'disqualified', 'withdrawn'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add unique constraint on tournament + club (if not exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tournament_participants_tournament_id_club_id_key'
    ) THEN
        ALTER TABLE public.tournament_participants
            ADD CONSTRAINT tournament_participants_tournament_id_club_id_key
            UNIQUE(tournament_id, club_id);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- STEP 4: Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament
    ON public.tournament_participants(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_club
    ON public.tournament_participants(club_id);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_status
    ON public.tournament_participants(tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_type
    ON public.tournament_participants(tournament_id, type);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_group
    ON public.tournament_participants(tournament_id, group_id)
    WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_seed
    ON public.tournament_participants(tournament_id, seed)
    WHERE seed IS NOT NULL;

-- ============================================
-- STEP 5: Create trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_tournament_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tournament_participants_updated_at
    ON public.tournament_participants;

CREATE TRIGGER trigger_update_tournament_participants_updated_at
    BEFORE UPDATE ON public.tournament_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_tournament_participants_updated_at();

-- ============================================
-- STEP 6: Populate name from clubs (for existing records)
-- ============================================

UPDATE public.tournament_participants tp
SET name = c.name
FROM public.clubs c
WHERE tp.club_id = c.id
  AND tp.name IS NULL
  AND c.id IS NOT NULL;

-- ============================================
-- STEP 7: Enable Row Level Security (RLS)
-- ============================================

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 8: Create RLS Policies
-- ============================================

-- Drop existing policies (to recreate them fresh)
DROP POLICY IF EXISTS "public_read_participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "authenticated_insert_participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "authenticated_update_participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "authenticated_delete_participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "admin_all_participants" ON public.tournament_participants;

-- Public can read all participants
CREATE POLICY "public_read_participants"
    ON public.tournament_participants
    FOR SELECT
    USING (true);

-- Authenticated users can insert participants
CREATE POLICY "authenticated_insert_participants"
    ON public.tournament_participants
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Authenticated users can update participants
CREATE POLICY "authenticated_update_participants"
    ON public.tournament_participants
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Authenticated users can delete participants
CREATE POLICY "authenticated_delete_participants"
    ON public.tournament_participants
    FOR DELETE
    TO authenticated
    USING (true);

-- Admins have full access (if users table exists)
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        EXECUTE 'CREATE POLICY "admin_all_participants"
            ON public.tournament_participants
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM public.users
                    WHERE id = auth.uid()
                    AND role IN (''super_admin'', ''admin_general'', ''admin'')
                )
            )';
    END IF;
END $$;

-- ============================================
-- STEP 9: Grant permissions
-- ============================================

GRANT SELECT ON public.tournament_participants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournament_participants TO authenticated;

-- ============================================
-- STEP 10: Reload PostgREST schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';

-- ============================================
-- STEP 11: Verification queries
-- ============================================

-- Show table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tournament_participants'
ORDER BY ordinal_position;

-- Show indexes
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'tournament_participants';

-- Show constraints
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.tournament_participants'::regclass;

-- Show RLS policies
SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tournament_participants';

-- Count existing records
SELECT COUNT(*) as total_participants FROM public.tournament_participants;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT '✅ Tournament participants table has been successfully created/updated!' AS result;
SELECT '✅ PostgREST schema cache has been reloaded!' AS result;
SELECT '✅ You can now create participants in your tournaments!' AS result;

-- ============================================
-- TROUBLESHOOTING
-- ============================================

-- If you still get schema cache errors, wait 10 seconds and run:
-- NOTIFY pgrst, 'reload schema';

-- To verify the table is accessible via the API, try:
-- SELECT * FROM tournament_participants LIMIT 1;

-- To check if RLS is blocking you:
-- SELECT current_user, current_setting('role');
