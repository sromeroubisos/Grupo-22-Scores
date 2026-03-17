-- ============================================
-- G22 SCORES - ESQUEMA COMPLETO (MVP)
-- Generado para Supabase / PostgreSQL
-- ============================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. CONFIGURACIÓN DE USUARIOS (Extiende Auth)
-- ============================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'super_admin', 'operator', 'club_admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. TABLAS PRINCIPALES (Estructura Deportiva)
-- ============================================

-- Carpetas / Organizadores (Folders)
CREATE TABLE IF NOT EXISTS public.folders (
    id TEXT PRIMARY KEY, -- Ej: 'urba', 'sudamerica'
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uniones / Federaciones
CREATE TABLE IF NOT EXISTS public.unions (
    id TEXT PRIMARY KEY, -- Ej: 'uar', 'urba' (Usamos TEXT para IDs legibles o UUID por defecto)
    name TEXT NOT NULL,
    season_ids TEXT[], -- Array de temporadas activas ['2025', '2026']
    branding JSONB DEFAULT '{}'::jsonb, -- { primaryColor: '...', logoUrl: '...' }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clubes / Equipos
CREATE TABLE IF NOT EXISTS public.clubs (
    id TEXT PRIMARY KEY, -- Ej: 'sic', 'casi'
    union_id TEXT REFERENCES public.unions(id) ON DELETE SET NULL,
    folder_id TEXT REFERENCES public.folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    city TEXT,
    logo_url TEXT,
    primary_color TEXT,
    slug TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
    -- external_id para mapeo con APIs externas si es necesario
);

-- Torneos
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    union_id TEXT REFERENCES public.unions(id) ON DELETE SET NULL,
    folder_id TEXT REFERENCES public.folders(id) ON DELETE SET NULL,
    season_id TEXT NOT NULL DEFAULT '2026',
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    status TEXT CHECK (status IN ('draft', 'published', 'archived', 'active')) DEFAULT 'draft',
    sport TEXT CHECK (sport IN ('rugby', 'football', 'hockey', 'basketball', 'volleyball')) DEFAULT 'rugby',
    category TEXT, -- 'Primera', 'Intermedia'
    format TEXT, -- 'League', 'Knockout', etc.
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partidos (Matches)
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_id TEXT, -- 'F1', 'QF', 'SF'
    date_time TIMESTAMPTZ NOT NULL,
    venue TEXT,
    home_club_id TEXT REFERENCES public.clubs(id), -- Puede ser null si es "TBD"
    away_club_id TEXT REFERENCES public.clubs(id),
    status TEXT CHECK (status IN ('scheduled', 'live', 'final', 'postponed', 'suspended')) DEFAULT 'scheduled',
    score JSONB DEFAULT '{"home": 0, "away": 0}'::jsonb,
    clock JSONB DEFAULT '{"running": false, "seconds": 0, "period": "1T"}'::jsonb,
    live_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración de Fases (PhaseConfiguration)
CREATE TABLE IF NOT EXISTS public.phase_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phase_type TEXT, -- 'groups', 'elimination'
    config JSONB DEFAULT '{}'::jsonb,
    selected_team_ids TEXT[], 
    fixture_data JSONB, -- Estructura compleja del fixture
    is_fixture_generated BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. PERMISOS Y RELACIONES
-- ============================================

-- Membresías (Roles específicos por entidad)
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    scope_type TEXT CHECK (scope_type IN ('union', 'tournament', 'club')),
    scope_id TEXT NOT NULL, -- ID de la unión, torneo o club
    role TEXT CHECK (role IN ('admin', 'operator', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, scope_type, scope_id)
);

-- Favoritos (Usuarios siguiendo entidades)
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    entity_type TEXT CHECK (entity_type IN ('tournament', 'club', 'match')),
    entity_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_type, entity_id)
);

-- ============================================
-- 4. DATOS EXTERNOS / API (Cache)
-- ============================================

CREATE TABLE IF NOT EXISTS public.external_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL, -- 'FlashScore', 'RugbyApi'
    entity_type TEXT NOT NULL, -- 'tournament', 'club'
    external_id TEXT NOT NULL,
    data JSONB NOT NULL, -- Payload completo
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, entity_type, external_id)
);

-- ============================================
-- 5. DISCIPLINA Y REGLAMENTOS
-- ============================================

-- Incidentes Disciplinarios (Tarjetas, Suspensiones)
CREATE TABLE IF NOT EXISTS public.discipline_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
    player_id UUID, -- Referencia a tabla players si existe, o TEXT
    player_name TEXT,
    club_id TEXT REFERENCES public.clubs(id), -- Referencia opcional al club
    incident_type TEXT, -- 'Tarjeta Roja', 'Amarilla', 'Citación'
    description TEXT,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
    status TEXT CHECK (status IN ('pending', 'review', 'resolved')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sanciones Aplicadas
CREATE TABLE IF NOT EXISTS public.discipline_sanctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES public.discipline_incidents(id) ON DELETE CASCADE,
    summary TEXT,
    weeks INTEGER, -- Semanas de suspensión
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reglamentos (Texto rico / HTML)
CREATE TABLE IF NOT EXISTS public.regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type TEXT CHECK (scope_type IN ('global', 'tournament', 'union')),
    scope_id TEXT, -- ID de la entidad relacionada
    content TEXT, -- HTML o Markdown
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. NOTICIAS Y CONTENIDO
-- ============================================

CREATE TABLE IF NOT EXISTS public.news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    image_url TEXT,
    scope TEXT CHECK (scope IN ('global', 'tournament', 'club')),
    scope_id TEXT,
    author_id UUID REFERENCES public.users(id),
    status TEXT DEFAULT 'draft',
    sport TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. SEGURIDAD BÁSICA (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Política 1: Lectura Pública (Cualquiera puede ver torneos y partidos publicados)
DROP POLICY IF EXISTS "Public Read Tournaments" ON public.tournaments;
CREATE POLICY "Public Read Tournaments" ON public.tournaments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Clubs" ON public.clubs;
CREATE POLICY "Public Read Clubs" ON public.clubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Matches" ON public.matches;
CREATE POLICY "Public Read Matches" ON public.matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read News" ON public.news;
CREATE POLICY "Public Read News" ON public.news FOR SELECT USING (status = 'published');

-- Política 2: Super Admin Total (Acceso a todo)
-- Nota: Esto requiere que tengas un usuario con role='super_admin' en public.users
DROP POLICY IF EXISTS "Super Admin Full Access Users" ON public.users;
CREATE POLICY "Super Admin Full Access Users" ON public.users USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Super Admin Full Access Tournaments" ON public.tournaments;
CREATE POLICY "Super Admin Full Access Tournaments" ON public.tournaments USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);
-- ... (repetir para otras tablas si se desea strict mode)

-- Política 3: Usuarios Autenticados (Lectura básica, escritura restringida)
-- Por ahora, para MVP, permitimos que usuarios autenticados creen cosas si no hay restricción fuerte
DROP POLICY IF EXISTS "Auth Users Can Create" ON public.tournaments;
CREATE POLICY "Auth Users Can Create" ON public.tournaments FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- 7. TRIGGERS ÚTILES (Actualización de timestamps)
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_matches_updated_at ON public.matches;
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_regulations_updated_at ON public.regulations;
CREATE TRIGGER update_regulations_updated_at BEFORE UPDATE ON public.regulations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- 8. MANEJO DE NUEVOS USUARIOS (Auth Hook)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url',
        'user' -- Rol por defecto
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disparador cada vez que alguien se registra en Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
