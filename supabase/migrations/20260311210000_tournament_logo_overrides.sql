-- Migration to add logo overrides and original logo storage for API-managed tournaments

ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS custom_logo_url TEXT,
ADD COLUMN IF NOT EXISTS original_logo_url TEXT;

COMMENT ON COLUMN public.tournaments.custom_logo_url IS 'Manual override for tournament logo (frontend priority)';
COMMENT ON COLUMN public.tournaments.original_logo_url IS 'Original logo URL from the API source (read-only reference)';
