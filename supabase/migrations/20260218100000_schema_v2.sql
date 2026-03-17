-- ============================================
-- G22 SCORES - ESQUEMA V2 (Optimizado)
-- ============================================

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USUARIOS Y ROLES (Modelo Simplificado)
-- ============================================
-- Se definen 2 roles base en la tabla 'users':
-- 'fan': Usuario normal (puede tener permisos extra vía 'memberships')
-- 'super_admin': Acceso total al sistema
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'fan' CHECK (role IN ('fan', 'super_admin')), 
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ESTRUCTURA DEPORTIVA
-- ============================================

-- Uniones / Federaciones (Entidad Padre)
CREATE TABLE IF NOT EXISTS public.unions (
    id TEXT PRIMARY KEY, -- Ej: 'uar', 'urba'
    name TEXT NOT NULL,
    country TEXT, -- Ej: 'Argentina'
    branding JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clubes
-- Se eliminó 'folder_id'. Se agregan 'region' y 'country' para filtros.
CREATE TABLE IF NOT EXISTS public.clubs (
    id TEXT PRIMARY KEY, -- Ej: 'sic'
    union_id TEXT REFERENCES public.unions(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    city TEXT,
    region TEXT, -- Filtro geográfico
    country TEXT,
    logo_url TEXT,
    primary_color TEXT,
    slug TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Torneos
-- Se eliminó 'folder_id'. Se agregan 'category', 'age_grade', 'region' para filtros dinámicos.
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    union_id TEXT REFERENCES public.unions(id) ON DELETE SET NULL,
    season_id TEXT NOT NULL DEFAULT '2026',
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    status TEXT CHECK (status IN ('draft', 'published', 'archived', 'active')) DEFAULT 'draft',
    -- Nuevos campos de filtro:
    sport TEXT CHECK (sport IN ('rugby', 'football', 'hockey', 'basketball', 'volleyball')) DEFAULT 'rugby',
    category TEXT,   -- Ej: 'Primera', 'Intermedia'
    age_grade TEXT,  -- Ej: 'Pays', 'M19', 'Superior'
    region TEXT,     -- Ej: 'Nacional', 'Regional NOA'
    country TEXT,    -- Ej: 'Argentina'
    format TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partidos
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_id TEXT,
    date_time TIMESTAMPTZ NOT NULL,
    venue TEXT,
    home_club_id TEXT REFERENCES public.clubs(id),
    away_club_id TEXT REFERENCES public.clubs(id),
    status TEXT CHECK (status IN ('scheduled', 'live', 'final', 'postponed', 'suspended')) DEFAULT 'scheduled',
    score JSONB DEFAULT '{"home": 0, "away": 0}'::jsonb,
    live_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. PERMISOS Y FAVORITOS
-- ============================================

-- Memberships: Define los "Usuarios con permisos"
-- Si un usuario es 'fan' pero tiene una entrada aquí para un torneo, es Editor de ese torneo.
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    scope_type TEXT CHECK (scope_type IN ('union', 'tournament', 'club')),
    scope_id TEXT NOT NULL, 
    role TEXT CHECK (role IN ('admin', 'editor')), -- Roles locales
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, scope_type, scope_id)
);

-- Favoritos: Para usuarios 'fan' (y todos)
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    entity_type TEXT CHECK (entity_type IN ('tournament', 'club', 'match', 'union')),
    entity_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_type, entity_id)
);

-- ============================================
-- 4. SEGURIDAD (RLS)
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Lectura pública para todos
DROP POLICY IF EXISTS "Public Read" ON public.tournaments;
CREATE POLICY "Public Read" ON public.tournaments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Matches" ON public.matches;
CREATE POLICY "Public Read Matches" ON public.matches FOR SELECT USING (true);

-- Super Admin: Acceso Total
DROP POLICY IF EXISTS "Super Admin Access" ON public.tournaments;
CREATE POLICY "Super Admin Access" ON public.tournaments USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- Editores: Acceso basado en Memberships
DROP POLICY IF EXISTS "Editor Access" ON public.tournaments;
CREATE POLICY "Editor Access" ON public.tournaments USING (
    EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() 
        AND scope_type = 'tournament' 
        AND scope_id = public.tournaments.id::text
        AND role IN ('admin', 'editor')
    )
);

-- ============================================
-- 5. TRIGGER REGISTRO AUTOMÁTICO
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url, role)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url', 'fan');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
