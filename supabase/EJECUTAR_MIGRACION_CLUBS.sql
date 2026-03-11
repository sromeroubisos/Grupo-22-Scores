-- ============================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- ============================================================
-- Este script aplica la normalización profesional de clubs
-- Copiar y pegar TODO el contenido en el SQL Editor de Supabase Studio
-- ============================================================

-- ============================================================
-- 1. CLUBS (CORE) - Refactor de tabla existente
-- ============================================================
-- Agregamos campos que faltaban para el modelo profesional

-- Nuevos campos de identidad y clasificación
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'club'
        CHECK (entity_type IN ('club', 'seleccion', 'academia', 'franquicia')),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'rugby',
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;

-- Asegurar validación de deportes
ALTER TABLE public.clubs 
    DROP CONSTRAINT IF EXISTS clubs_sport_check;

ALTER TABLE public.clubs 
    ADD CONSTRAINT clubs_sport_check 
    CHECK (sport IN (
        'rugby', 'football', 'tennis', 'basketball', 'hockey', 'volleyball', 
        'handball', 'baseball', 'american-football', 'field-hockey', 'cricket', 
        'snooker', 'table-tennis', 'darts', 'futsal', 'esports', 'golf', 
        'floorball', 'bandy', 'rugby-union', 'rugby-league', 'boxing', 
        'beach-volleyball', 'aussie-rules', 'badminton', 'water-polo', 
        'beach-soccer', 'mma', 'netball', 'pesapallo', 'motorsport', 
        'cycling', 'horse-racing', 'winter-sports', 'kabaddi'
    ));

-- Campos de integración (ya existe external_id de migración anterior)
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
        CHECK (source IN ('manual', 'api', 'import')),
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_status TEXT;

-- Campos de estado (renombrar status a lifecycle, agregar visibility)
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'visible'
        CHECK (visibility IN ('visible', 'hidden'));

-- Renombrar 'status' a 'lifecycle' (si existe)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clubs' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.clubs RENAME COLUMN status TO lifecycle;
    END IF;
END $$;

-- Asegurar que lifecycle tiene el check correcto
ALTER TABLE public.clubs
    DROP CONSTRAINT IF EXISTS clubs_lifecycle_check;
ALTER TABLE public.clubs
    ADD CONSTRAINT clubs_lifecycle_check
    CHECK (lifecycle IN ('draft', 'published', 'active', 'archived'));

-- Campo de notas internas
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS notes_internal TEXT;

-- Asegurar que updated_at existe
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 2. CLUB_PROFILE (DETALLE) - Nueva tabla para datos extensos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.club_profile (
    club_id TEXT PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,

    -- Contacto administrativo
    admin_contact_name TEXT,
    admin_contact_email TEXT,
    admin_contact_phone TEXT,

    -- Links y redes sociales
    website TEXT,
    instagram TEXT,
    x_url TEXT,
    youtube TEXT,
    tiktok TEXT,

    -- Venue principal (los secundarios van a club_venues)
    venue_name TEXT,
    venue_address TEXT,
    venue_capacity INTEGER,
    venue_notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CLUB_ALIASES (ARRAY NORMALIZADO) - Nombres alternativos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.club_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    alias TEXT NOT NULL CHECK (char_length(alias) >= 2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evitar duplicados
CREATE UNIQUE INDEX IF NOT EXISTS club_aliases_unique
    ON public.club_aliases (club_id, alias);

-- Índice para búsqueda rápida
CREATE INDEX IF NOT EXISTS club_aliases_alias_idx
    ON public.club_aliases (alias);

-- ============================================================
-- 4. CLUB_SECONDARY_UNIONS (ARRAY NORMALIZADO) - Uniones múltiples
-- ============================================================
CREATE TABLE IF NOT EXISTS public.club_secondary_unions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    union_id TEXT NOT NULL REFERENCES public.unions(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evitar duplicados
CREATE UNIQUE INDEX IF NOT EXISTS club_secondary_unions_unique
    ON public.club_secondary_unions (club_id, union_id);

-- Índice para consultas por unión
CREATE INDEX IF NOT EXISTS club_secondary_unions_union_idx
    ON public.club_secondary_unions (union_id);

-- ============================================================
-- 5. ÍNDICES ADICIONALES EN CLUBS
-- ============================================================
-- Índice único para external_id (solo cuando NO es NULL)
CREATE UNIQUE INDEX IF NOT EXISTS clubs_external_id_unique
    ON public.clubs (external_id)
    WHERE external_id IS NOT NULL;

-- Índices para filtros comunes
CREATE INDEX IF NOT EXISTS clubs_entity_type_idx ON public.clubs (entity_type);
CREATE INDEX IF NOT EXISTS clubs_visibility_idx ON public.clubs (visibility);
CREATE INDEX IF NOT EXISTS clubs_lifecycle_idx ON public.clubs (lifecycle);
CREATE INDEX IF NOT EXISTS clubs_source_idx ON public.clubs (source);
CREATE INDEX IF NOT EXISTS clubs_country_idx ON public.clubs (country);

-- ============================================================
-- 6. TRIGGERS PARA updated_at AUTOMÁTICO
-- ============================================================

-- La función set_updated_at() ya existe de migraciones anteriores
-- Solo agregamos los triggers que falten

DROP TRIGGER IF EXISTS trg_clubs_updated_at ON public.clubs;
CREATE TRIGGER trg_clubs_updated_at
    BEFORE UPDATE ON public.clubs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_club_profile_updated_at ON public.club_profile;
CREATE TRIGGER trg_club_profile_updated_at
    BEFORE UPDATE ON public.club_profile
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 7. RLS POLICIES (Básicas - se pueden extender después)
-- ============================================================

-- Ya existe RLS en clubs de migraciones anteriores
-- Agregamos para las nuevas tablas

ALTER TABLE public.club_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_secondary_unions ENABLE ROW LEVEL SECURITY;

-- CLUB_PROFILE: mismas políticas que clubs
DROP POLICY IF EXISTS "club_profile_public_read" ON public.club_profile;
CREATE POLICY "club_profile_public_read" ON public.club_profile
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.clubs
            WHERE id = club_profile.club_id
            AND is_visible = TRUE
        )
    );

DROP POLICY IF EXISTS "club_profile_super_admin_all" ON public.club_profile;
CREATE POLICY "club_profile_super_admin_all" ON public.club_profile
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

DROP POLICY IF EXISTS "club_profile_admin_write" ON public.club_profile;
CREATE POLICY "club_profile_admin_write" ON public.club_profile
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE user_id = auth.uid()
            AND scope_type = 'club'
            AND scope_id = club_profile.club_id
            AND role IN ('admin', 'editor')
        )
    );

-- CLUB_ALIASES: lectura pública, escritura solo admins
DROP POLICY IF EXISTS "club_aliases_public_read" ON public.club_aliases;
CREATE POLICY "club_aliases_public_read" ON public.club_aliases
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "club_aliases_super_admin_all" ON public.club_aliases;
CREATE POLICY "club_aliases_super_admin_all" ON public.club_aliases
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

DROP POLICY IF EXISTS "club_aliases_admin_write" ON public.club_aliases;
CREATE POLICY "club_aliases_admin_write" ON public.club_aliases
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE user_id = auth.uid()
            AND scope_type = 'club'
            AND scope_id = club_aliases.club_id
            AND role IN ('admin', 'editor')
        )
    );

-- CLUB_SECONDARY_UNIONS: lectura pública, escritura solo admins
DROP POLICY IF EXISTS "club_secondary_unions_public_read" ON public.club_secondary_unions;
CREATE POLICY "club_secondary_unions_public_read" ON public.club_secondary_unions
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "club_secondary_unions_super_admin_all" ON public.club_secondary_unions;
CREATE POLICY "club_secondary_unions_super_admin_all" ON public.club_secondary_unions
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

DROP POLICY IF EXISTS "club_secondary_unions_admin_write" ON public.club_secondary_unions;
CREATE POLICY "club_secondary_unions_admin_write" ON public.club_secondary_unions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE user_id = auth.uid()
            AND scope_type = 'club'
            AND scope_id = club_secondary_unions.club_id
            AND role IN ('admin', 'editor')
        )
    );

-- ============================================================
-- 8. COMENTARIOS (Documentación en DB)
-- ============================================================
COMMENT ON TABLE public.clubs IS 'CORE: Campos esenciales y de búsqueda frecuente';
COMMENT ON TABLE public.club_profile IS 'PROFILE: Datos extensos de contacto, redes y venue';
COMMENT ON TABLE public.club_aliases IS 'ALIASES: Nombres alternativos del club (normalizado)';
COMMENT ON TABLE public.club_secondary_unions IS 'SECONDARY_UNIONS: Uniones adicionales del club (normalizado)';

COMMENT ON COLUMN public.clubs.entity_type IS 'Tipo: club, selección, academia, franquicia';
COMMENT ON COLUMN public.clubs.source IS 'Origen de datos: manual, api, import';
COMMENT ON COLUMN public.clubs.visibility IS 'Visibilidad pública: visible o hidden';
COMMENT ON COLUMN public.clubs.lifecycle IS 'Estado del ciclo de vida: draft, published, active, archived';
COMMENT ON COLUMN public.clubs.notes_internal IS 'Notas internas solo para admins';

-- ============================================================
-- ✅ MIGRACIÓN COMPLETADA
-- ============================================================
-- Ahora tienes:
-- 1. clubs (core) - datos esenciales
-- 2. club_profile - datos extensos
-- 3. club_aliases - nombres alternativos normalizados
-- 4. club_secondary_unions - uniones adicionales normalizadas
-- 5. Índices optimizados
-- 6. RLS policies básicas
-- 7. Triggers para updated_at automático
-- ============================================================
