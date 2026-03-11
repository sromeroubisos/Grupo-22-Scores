-- ============================================================
-- RESTORE MISSING CORE TABLES (Discipline, Regulations, News)
-- ============================================================
-- These tables were defined in the initial schema but might have been 
-- omitted or dropped during schema migrations (e.g., reset).
-- Re-creating them ensuring compatibility with Schema V2.

-- 1. UTILITIES
-- Ensure authorize_admin works for future audit logs/security
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. DISCIPLINE INCIDENTS
CREATE TABLE IF NOT EXISTS public.discipline_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    player_id UUID, -- Placeholder for future Players table
    player_name TEXT NOT NULL,
    club_id TEXT REFERENCES public.clubs(id) ON DELETE SET NULL,
    incident_type TEXT NOT NULL, -- 'Tarjeta Roja', 'Amarilla', 'Citación'
    description TEXT,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('pending', 'review', 'resolved')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DISCIPLINE SANCTIONS
CREATE TABLE IF NOT EXISTS public.discipline_sanctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES public.discipline_incidents(id) ON DELETE CASCADE,
    summary TEXT,
    weeks INTEGER DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status TEXT CHECK (status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. REGULATIONS
CREATE TABLE IF NOT EXISTS public.regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type TEXT CHECK (scope_type IN ('global', 'tournament', 'union', 'club')),
    scope_id TEXT, -- ID of the related entity
    content TEXT, -- HTML or Markdown content
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. NEWS
CREATE TABLE IF NOT EXISTS public.news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    image_url TEXT,
    scope TEXT CHECK (scope IN ('global', 'tournament', 'club', 'union')),
    scope_id TEXT,
    author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
    sport TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE public.discipline_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discipline_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Select policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public Read Incidents" ON public.discipline_incidents;
    CREATE POLICY "Public Read Incidents" ON public.discipline_incidents FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Public Read Sanctions" ON public.discipline_sanctions;
    CREATE POLICY "Public Read Sanctions" ON public.discipline_sanctions FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Public Read Regulations" ON public.regulations;
    CREATE POLICY "Public Read Regulations" ON public.regulations FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Public Read News" ON public.news;
    CREATE POLICY "Public Read News" ON public.news FOR SELECT USING (status = 'published');
END $$;

-- Admin policies (Full access for super_admins)
DO $$ 
BEGIN
    -- Incidents
    DROP POLICY IF EXISTS "Super Admin Incidents" ON public.discipline_incidents;
    CREATE POLICY "Super Admin Incidents" ON public.discipline_incidents 
    FOR ALL TO authenticated USING (public.authorize_admin());

    -- Sanctions
    DROP POLICY IF EXISTS "Super Admin Sanctions" ON public.discipline_sanctions;
    CREATE POLICY "Super Admin Sanctions" ON public.discipline_sanctions 
    FOR ALL TO authenticated USING (public.authorize_admin());

    -- Regulations
    DROP POLICY IF EXISTS "Super Admin Regulations" ON public.regulations;
    CREATE POLICY "Super Admin Regulations" ON public.regulations 
    FOR ALL TO authenticated USING (public.authorize_admin());

    -- News
    DROP POLICY IF EXISTS "Super Admin News" ON public.news;
    CREATE POLICY "Super Admin News" ON public.news 
    FOR ALL TO authenticated USING (public.authorize_admin());
END $$;

-- 7. TIMESTAMPS TRIGGER
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_discipline_incidents_updated_at') THEN
        CREATE TRIGGER update_discipline_incidents_updated_at BEFORE UPDATE ON public.discipline_incidents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_discipline_sanctions_updated_at') THEN
        CREATE TRIGGER update_discipline_sanctions_updated_at BEFORE UPDATE ON public.discipline_sanctions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_news_updated_at') THEN
        CREATE TRIGGER update_news_updated_at BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
