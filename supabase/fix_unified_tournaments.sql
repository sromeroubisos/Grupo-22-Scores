-- Add missing columns for unified tournament management
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS is_api_managed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS original_name TEXT;

-- Ensure sport_id and country_id exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'sport_id') THEN
        ALTER TABLE public.tournaments ADD COLUMN sport_id TEXT;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'sport') THEN
            UPDATE public.tournaments SET sport_id = sport;
        END IF;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'country_id') THEN
        ALTER TABLE public.tournaments ADD COLUMN country_id TEXT;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'country') THEN
            UPDATE public.tournaments SET country_id = country;
        END IF;
    END IF;
END $$;

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
