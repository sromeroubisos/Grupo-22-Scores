ALTER TABLE public.clubs 
ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS clock JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clubs.categories IS 'Array of category tags for the club (e.g. age grades, squad types)';
COMMENT ON COLUMN public.matches.clock IS 'Live clock state for the match (period, time, etc)';
