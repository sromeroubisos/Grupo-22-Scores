-- ============================================
-- ALIGN MATCHES SCHEMA: Execute this in Supabase SQL Editor
-- ============================================

-- 1. Add new columns to public.matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS phase_id UUID NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS group_id UUID NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS referee TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pitch TEXT;

-- 2. Add foreign key constraints
ALTER TABLE public.matches 
DROP CONSTRAINT IF EXISTS matches_phase_id_fkey,
ADD CONSTRAINT matches_phase_id_fkey FOREIGN KEY (phase_id) 
REFERENCES public.tournament_phases(id) ON DELETE SET NULL;

ALTER TABLE public.matches 
DROP CONSTRAINT IF EXISTS matches_group_id_fkey,
ADD CONSTRAINT matches_group_id_fkey FOREIGN KEY (group_id) 
REFERENCES public.tournament_groups(id) ON DELETE SET NULL;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_phase_id ON public.matches(phase_id);
CREATE INDEX IF NOT EXISTS idx_matches_group_id ON public.matches(group_id);

-- 4. Reload Schema Cache
NOTIFY pgrst, 'reload schema';

-- Verification Query
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'matches' 
AND column_name IN ('phase_id', 'group_id', 'referee', 'pitch');
