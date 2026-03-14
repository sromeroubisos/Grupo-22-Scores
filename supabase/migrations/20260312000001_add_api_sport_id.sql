-- Migration to add API-specific columns to sports table
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS api_sport_id TEXT UNIQUE;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS sport_url TEXT;

-- Index for faster lookups by API ID
CREATE INDEX IF NOT EXISTS idx_sports_api_id ON public.sports(api_sport_id);

-- Update existing records if possible (manual mapping for core sports)
UPDATE public.sports SET api_sport_id = '1', slug = 'football', sport_url = '/football/' WHERE id = 'football';
UPDATE public.sports SET api_sport_id = '2', slug = 'tennis', sport_url = '/tennis/' WHERE id = 'tennis';
UPDATE public.sports SET api_sport_id = '3', slug = 'basketball', sport_url = '/basketball/' WHERE id = 'basketball';
UPDATE public.sports SET api_sport_id = '4', slug = 'hockey', sport_url = '/hockey/' WHERE id = 'hockey';
UPDATE public.sports SET api_sport_id = '8', slug = 'rugby-union', sport_url = '/rugby-union/' WHERE id = 'rugby'; -- Mapping generic rugby to rugby-union as requested
UPDATE public.sports SET api_sport_id = '5', slug = 'american-football', sport_url = '/american-football/' WHERE id = 'american-football';
UPDATE public.sports SET api_sport_id = '12', slug = 'volleyball', sport_url = '/volleyball/' WHERE id = 'volleyball';
UPDATE public.sports SET api_sport_id = '7', slug = 'handball', sport_url = '/handball/' WHERE id = 'handball';
UPDATE public.sports SET api_sport_id = '6', slug = 'baseball', sport_url = '/baseball/' WHERE id = 'baseball';
