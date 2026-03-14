-- Ensure sports table has admin-controlled columns
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS)

ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_visible    BOOLEAN  DEFAULT true;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS display_order INTEGER  DEFAULT 100;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS name_es       TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS updated_by    UUID     REFERENCES auth.users(id);
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- Seed default display_order for any existing rows that have NULL
UPDATE public.sports
SET display_order = 100
WHERE display_order IS NULL;
