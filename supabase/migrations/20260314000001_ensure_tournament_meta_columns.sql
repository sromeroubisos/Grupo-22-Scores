-- ============================================================
-- Ensure Tournament Metadata Columns (is_popular and display_order)
-- Fixes error PGRST204: "Could not find the 'is_popular' column"
-- ============================================================

-- Use the requested exact SQL pattern for is_popular
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT false;

-- Also ensure display_order exists for manual sorting feature
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Backfill comments for clarity
COMMENT ON COLUMN public.tournaments.is_popular IS 'Flag to mark tournaments as popular for priority display';
COMMENT ON COLUMN public.tournaments.display_order IS 'Numeric value to control manual sorting of tournaments';

-- CRITICAL: Refresh PostgREST schema cache so Supabase sees the columns
NOTIFY pgrst, 'reload schema';
