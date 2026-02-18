-- Add external_id columns if they don't exist yet
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
NOTIFY pgrst, 'reload config';
