-- ============================================
-- ADD API TOURNAMENTS SUPPORT (v3)
-- ============================================

-- Create Sports table
CREATE TABLE IF NOT EXISTS public.sports (
    id TEXT PRIMARY KEY, 
    name TEXT NOT NULL,
    icon TEXT,
    is_active BOOLEAN DEFAULT false,
    priority INT DEFAULT 99,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Countries table
CREATE TABLE IF NOT EXISTS public.countries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    flag_emoji TEXT,
    region TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update Tournaments table with API specific fields
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS original_name TEXT,
    ADD COLUMN IF NOT EXISTS url TEXT,
    ADD COLUMN IF NOT EXISTS is_api_managed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS data_source TEXT,
    ADD COLUMN IF NOT EXISTS priority INT DEFAULT 99,
    ADD COLUMN IF NOT EXISTS country_id TEXT REFERENCES public.countries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sport_id TEXT REFERENCES public.sports(id) ON DELETE SET NULL;

-- Create Categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, name)
);

-- Create Seasons table
CREATE TABLE IF NOT EXISTS public.seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id TEXT NOT NULL, -- The string reference, e.g., '2026'
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    teams_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, tournament_id)
);

-- RLS
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "Public Read Sports" ON public.sports FOR SELECT USING (true);
CREATE POLICY "Public Read Countries" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Public Read Categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public Read Seasons" ON public.seasons FOR SELECT USING (true);

-- Admin write policies
CREATE POLICY "Admin Administer Sports" ON public.sports FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'admin_general'))
);
CREATE POLICY "Admin Administer Countries" ON public.countries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'admin_general'))
);
CREATE POLICY "Admin Administer Categories" ON public.categories FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'admin_general'))
);
CREATE POLICY "Admin Administer Seasons" ON public.seasons FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'admin_general'))
);
