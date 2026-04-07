ALTER TABLE public.club_family_divisions
    ADD COLUMN IF NOT EXISTS group_name TEXT;

COMMENT ON COLUMN public.club_family_divisions.group_name IS
    'Human-readable name for the roster-sharing group, for example M16 or Plantel Superior.';
