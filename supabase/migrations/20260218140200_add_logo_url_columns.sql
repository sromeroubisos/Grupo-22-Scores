-- Add logo_url columns to existing tables that predate the migration
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS logo_url TEXT;
NOTIFY pgrst, 'reload config';
