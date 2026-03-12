-- ============================================
-- MANUAL FIX: Tournament Participants Error
-- ============================================
-- This file contains SQL to manually fix the tournament_participants table
-- Run this in your Supabase SQL Editor if you're having errors creating participants

-- Step 1: Make club_id nullable (to support manual entries)
ALTER TABLE public.tournament_participants
    ALTER COLUMN club_id DROP NOT NULL;

-- Step 2: Add name column if it doesn't exist (to support manual entries)
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS name TEXT;

-- Step 3: Add type column for participant classification
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS type TEXT
    CHECK (type IN ('club', 'national_team', 'franchise', 'invited', 'individual'))
    DEFAULT 'club';

-- Step 4: Add short_code column if missing
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Step 5: Add notes column
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Step 6: Ensure created_at and updated_at exist
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 7: Update status enum to include all states
DO $$ BEGIN
    ALTER TABLE public.tournament_participants
        DROP CONSTRAINT IF EXISTS tournament_participants_status_check;
    ALTER TABLE public.tournament_participants
        ADD CONSTRAINT tournament_participants_status_check
        CHECK (status IN ('active', 'inactive', 'pending', 'disqualified', 'withdrawn'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Step 8: Populate name from club for existing records
UPDATE public.tournament_participants tp
SET name = c.name
FROM public.clubs c
WHERE tp.club_id = c.id
  AND tp.name IS NULL;

-- Step 9: Create indexes for better performance
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

-- Step 10: Create trigger to auto-update updated_at
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
-- VERIFICATION QUERIES
-- ============================================

-- Check the table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tournament_participants'
ORDER BY ordinal_position;

-- Check constraints
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.tournament_participants'::regclass;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Tournament participants table has been successfully updated!' AS result;
