-- ============================================================
-- MIGRATION: People, Squad Members & Staff
-- Fecha: 2026-02-25
-- Descripción: Crea las tablas para gestionar personas (jugadores y staff)
--              vinculándolos a clubes y divisiones.
-- ============================================================

-- 1. TABLA club_divisions (Si no existe aún)
CREATE TABLE IF NOT EXISTS public.club_divisions (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     TEXT    NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    season      TEXT    DEFAULT '2026',
    status      TEXT    DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
    sport       TEXT    DEFAULT 'rugby',
    gender      TEXT    CHECK (gender IN ('Masculino', 'Femenino', 'Mixto')),
    category    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (club_id, name)
);

-- 2. TABLA people: Datos base de personas (Players, Coaches, etc)
CREATE TABLE IF NOT EXISTS public.people (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name  TEXT    NOT NULL,
    last_name   TEXT    NOT NULL,
    full_name   TEXT    GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    id_number   TEXT,   -- DNI, Pasaporte, Licencia
    birth_date  DATE,
    gender      TEXT    CHECK (gender IN ('Masculino', 'Femenino', 'Otro')),
    email       TEXT,
    phone       TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA club_person_roles: Relación entre personas y clubes/planteles
CREATE TABLE IF NOT EXISTS public.club_person_roles (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     TEXT    NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
    person_id   UUID    NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    division_id UUID    REFERENCES public.club_divisions(id) ON DELETE CASCADE,
    role        TEXT    NOT NULL CHECK (role IN (
        'player', 
        'head_coach', 
        'assistant_coach', 
        'fitness_coach', 
        'manager', 
        'doctor', 
        'physio', 
        'video_analyst'
    )),
    status      TEXT    DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    joined_at   DATE,
    left_at     DATE,
    position    TEXT,   -- Pilar, Apertura, etc.
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(club_id, person_id, division_id, role)
);

-- 4. RLS POLICIES
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_person_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "people_public_read" ON public.people;
    DROP POLICY IF EXISTS "roles_public_read" ON public.club_person_roles;
    DROP POLICY IF EXISTS "people_admin_all" ON public.people;
    DROP POLICY IF EXISTS "roles_admin_all" ON public.club_person_roles;
END $$;

-- Lectura pública
CREATE POLICY "people_public_read" ON public.people FOR SELECT USING (true);
CREATE POLICY "roles_public_read" ON public.club_person_roles FOR SELECT USING (true);

-- Escritura Administradores
CREATE POLICY "people_admin_all" ON public.people FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

CREATE POLICY "roles_admin_all" ON public.club_person_roles FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

-- 5. ÍNDICES
CREATE INDEX IF NOT EXISTS people_full_name_idx ON public.people (full_name);
CREATE INDEX IF NOT EXISTS roles_club_id_idx ON public.club_person_roles (club_id);
CREATE INDEX IF NOT EXISTS roles_person_id_idx ON public.club_person_roles (person_id);
CREATE INDEX IF NOT EXISTS roles_division_id_idx ON public.club_person_roles (division_id);
