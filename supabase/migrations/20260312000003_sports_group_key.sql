-- Add group_key support to the sports table.
-- This allows rugby-union and rugby-league to be tagged as members of the
-- 'rugby' parent group so the UI can unify them under a single visible entry.

ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS group_key TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Tag the two rugby variants
UPDATE public.sports SET group_key = 'rugby', group_name = 'Rugby' WHERE id = 'rugby-union';
UPDATE public.sports SET group_key = 'rugby', group_name = 'Rugby' WHERE id = 'rugby-league';
