-- ============================================================
-- MIGRATION: Club Divisions & Venues
-- Fecha: 2026-02-19
-- Descripción: Agrega columnas faltantes en clubs, crea tablas
--   club_divisions y club_venues, índices y RLS.
-- ============================================================

-- ============================================================
-- 1. COLUMNAS FALTANTES EN clubs
-- ============================================================

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS sport     TEXT DEFAULT 'rugby',
    ADD COLUMN IF NOT EXISTS status    TEXT DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Índices en clubs
CREATE UNIQUE INDEX IF NOT EXISTS clubs_slug_idx      ON public.clubs (slug)        WHERE slug IS NOT NULL;
CREATE        INDEX IF NOT EXISTS clubs_union_id_idx  ON public.clubs (union_id);
CREATE        INDEX IF NOT EXISTS clubs_sport_idx     ON public.clubs (sport);
CREATE        INDEX IF NOT EXISTS clubs_status_idx    ON public.clubs (status);

-- ============================================================
-- 2. TABLA club_divisions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.club_divisions (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     TEXT    NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    slug        TEXT,
    sport       TEXT,
    gender      TEXT    CHECK (gender IN ('Masculino', 'Femenino', 'Mixto')),
    category    TEXT,
    status      TEXT    DEFAULT 'active'
                        CHECK (status IN ('active', 'draft', 'archived')),
    featured    BOOLEAN DEFAULT FALSE,
    season      TEXT    DEFAULT '2026',
    format      TEXT,
    regulation  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (club_id, name)
);

CREATE        INDEX IF NOT EXISTS divisions_club_id_idx   ON public.club_divisions (club_id);
CREATE        INDEX IF NOT EXISTS divisions_status_idx    ON public.club_divisions (status);

-- ============================================================
-- 3. TABLA club_venues
-- ============================================================

CREATE TABLE IF NOT EXISTS public.club_venues (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     TEXT    NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    address     TEXT,
    city        TEXT,
    maps_link   TEXT,
    is_primary  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS venues_club_id_idx ON public.club_venues (club_id);

-- ============================================================
-- 4. TRIGGER updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS divisions_updated_at ON public.club_divisions;
CREATE TRIGGER divisions_updated_at
    BEFORE UPDATE ON public.club_divisions
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS venues_updated_at ON public.club_venues;
CREATE TRIGGER venues_updated_at
    BEFORE UPDATE ON public.club_venues
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ============================================================
-- 5. RLS — clubs
-- ============================================================

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- Lectura pública solo clubes visibles
DROP POLICY IF EXISTS "clubs_public_read"      ON public.clubs;
CREATE POLICY "clubs_public_read" ON public.clubs
    FOR SELECT
    USING (is_visible = TRUE);

-- Super admin: acceso total
DROP POLICY IF EXISTS "clubs_super_admin_all"  ON public.clubs;
CREATE POLICY "clubs_super_admin_all" ON public.clubs
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

-- Admin de unión: puede ver/editar clubes de su unión
DROP POLICY IF EXISTS "clubs_union_admin_write" ON public.clubs;
CREATE POLICY "clubs_union_admin_write" ON public.clubs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE user_id   = auth.uid()
              AND scope_type = 'union'
              AND scope_id   = public.clubs.union_id
              AND role       IN ('admin', 'editor')
        )
    );

-- Admin de club: puede ver/editar su propio club
DROP POLICY IF EXISTS "clubs_club_admin_write"  ON public.clubs;
CREATE POLICY "clubs_club_admin_write" ON public.clubs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE user_id   = auth.uid()
              AND scope_type = 'club'
              AND scope_id   = public.clubs.id
              AND role       IN ('admin', 'editor')
        )
    );

-- ============================================================
-- 6. RLS — club_divisions
-- ============================================================

ALTER TABLE public.club_divisions ENABLE ROW LEVEL SECURITY;

-- Lectura pública de divisiones activas
DROP POLICY IF EXISTS "divisions_public_read"     ON public.club_divisions;
CREATE POLICY "divisions_public_read" ON public.club_divisions
    FOR SELECT
    USING (status = 'active');

-- Super admin: acceso total
DROP POLICY IF EXISTS "divisions_super_admin_all" ON public.club_divisions;
CREATE POLICY "divisions_super_admin_all" ON public.club_divisions
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

-- Admin de unión / club: puede gestionar divisiones del club
DROP POLICY IF EXISTS "divisions_admin_write"     ON public.club_divisions;
CREATE POLICY "divisions_admin_write" ON public.club_divisions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.clubs c
            WHERE c.id = public.club_divisions.club_id
              AND (
                  EXISTS (
                      SELECT 1 FROM public.memberships
                      WHERE user_id   = auth.uid()
                        AND scope_type = 'union'
                        AND scope_id   = c.union_id
                        AND role       IN ('admin', 'editor')
                  )
                  OR
                  EXISTS (
                      SELECT 1 FROM public.memberships
                      WHERE user_id   = auth.uid()
                        AND scope_type = 'club'
                        AND scope_id   = c.id
                        AND role       IN ('admin', 'editor')
                  )
              )
        )
    );

-- ============================================================
-- 7. RLS — club_venues
-- ============================================================

ALTER TABLE public.club_venues ENABLE ROW LEVEL SECURITY;

-- Lectura pública de sedes
DROP POLICY IF EXISTS "venues_public_read"     ON public.club_venues;
CREATE POLICY "venues_public_read" ON public.club_venues
    FOR SELECT USING (TRUE);

-- Super admin: acceso total
DROP POLICY IF EXISTS "venues_super_admin_all" ON public.club_venues;
CREATE POLICY "venues_super_admin_all" ON public.club_venues
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

-- Admin: puede gestionar sedes de su club/unión
DROP POLICY IF EXISTS "venues_admin_write"     ON public.club_venues;
CREATE POLICY "venues_admin_write" ON public.club_venues
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.clubs c
            WHERE c.id = public.club_venues.club_id
              AND (
                  EXISTS (
                      SELECT 1 FROM public.memberships
                      WHERE user_id   = auth.uid()
                        AND scope_type = 'union'
                        AND scope_id   = c.union_id
                        AND role       IN ('admin', 'editor')
                  )
                  OR
                  EXISTS (
                      SELECT 1 FROM public.memberships
                      WHERE user_id   = auth.uid()
                        AND scope_type = 'club'
                        AND scope_id   = c.id
                        AND role       IN ('admin', 'editor')
                  )
              )
        )
    );
