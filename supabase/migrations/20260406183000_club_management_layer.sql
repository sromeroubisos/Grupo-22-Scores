-- ============================================================
-- MIGRATION: Club Management Layer
-- Fecha: 2026-04-06
-- Descripcion: Agrega capa operativa privada sobre clubs sin
-- duplicar la entidad canonica ni romper compatibilidad legacy.
-- ============================================================

-- ============================================================
-- 1. TABLAS NUEVAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.club_settings (
    club_id TEXT PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
    is_managed BOOLEAN NOT NULL DEFAULT FALSE,
    plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'pro', 'elite')),
    owner_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    features_enabled JSONB NOT NULL DEFAULT '{}'::jsonb,
    public_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.club_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL
        CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'invited', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_users_unique UNIQUE (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.club_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    legacy_division_id UUID NULL,
    name TEXT NOT NULL,
    slug TEXT,
    sport TEXT,
    gender TEXT CHECK (gender IN ('Masculino', 'Femenino', 'Mixto')),
    category TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'draft', 'archived')),
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    season TEXT,
    format TEXT,
    regulation TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_teams_unique UNIQUE (club_id, name)
);

CREATE TABLE IF NOT EXISTS public.team_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    team_id UUID NULL REFERENCES public.club_teams(id) ON DELETE CASCADE,
    person_id UUID NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    position TEXT,
    jersey_number INTEGER,
    squad_role TEXT,
    availability_status TEXT,
    notes TEXT,
    joined_at DATE,
    left_at DATE,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF to_regclass('public.club_divisions') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'club_teams_legacy_division_id_fkey'
       ) THEN
        ALTER TABLE public.club_teams
            ADD CONSTRAINT club_teams_legacy_division_id_fkey
            FOREIGN KEY (legacy_division_id)
            REFERENCES public.club_divisions(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.people') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'team_memberships_person_id_fkey'
       ) THEN
        ALTER TABLE public.team_memberships
            ADD CONSTRAINT team_memberships_person_id_fkey
            FOREIGN KEY (person_id)
            REFERENCES public.people(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS club_settings_owner_idx
    ON public.club_settings (owner_user_id);

CREATE INDEX IF NOT EXISTS club_settings_is_managed_idx
    ON public.club_settings (is_managed);

CREATE INDEX IF NOT EXISTS club_users_club_idx
    ON public.club_users (club_id);

CREATE INDEX IF NOT EXISTS club_users_user_idx
    ON public.club_users (user_id);

CREATE INDEX IF NOT EXISTS club_users_role_idx
    ON public.club_users (role);

CREATE INDEX IF NOT EXISTS club_teams_club_idx
    ON public.club_teams (club_id);

CREATE INDEX IF NOT EXISTS club_teams_status_idx
    ON public.club_teams (status);

CREATE UNIQUE INDEX IF NOT EXISTS club_teams_legacy_division_unique
    ON public.club_teams (legacy_division_id)
    WHERE legacy_division_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS team_memberships_club_idx
    ON public.team_memberships (club_id);

CREATE INDEX IF NOT EXISTS team_memberships_team_idx
    ON public.team_memberships (team_id);

CREATE INDEX IF NOT EXISTS team_memberships_person_idx
    ON public.team_memberships (person_id);

CREATE INDEX IF NOT EXISTS team_memberships_role_idx
    ON public.team_memberships (role);

-- ============================================================
-- 2. TRIGGERS updated_at
-- ============================================================

DROP TRIGGER IF EXISTS club_settings_updated_at ON public.club_settings;
CREATE TRIGGER club_settings_updated_at
    BEFORE UPDATE ON public.club_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS club_users_updated_at ON public.club_users;
CREATE TRIGGER club_users_updated_at
    BEFORE UPDATE ON public.club_users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS club_teams_updated_at ON public.club_teams;
CREATE TRIGGER club_teams_updated_at
    BEFORE UPDATE ON public.club_teams
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS team_memberships_updated_at ON public.team_memberships;
CREATE TRIGGER team_memberships_updated_at
    BEFORE UPDATE ON public.team_memberships
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_settings_admin_manage" ON public.club_settings;
CREATE POLICY "club_settings_admin_manage" ON public.club_settings
    FOR ALL TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_settings.club_id
              AND m.role IN ('admin', 'editor')
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_settings.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

DROP POLICY IF EXISTS "club_users_admin_manage" ON public.club_users;
CREATE POLICY "club_users_admin_manage" ON public.club_users
    FOR ALL TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_users.club_id
              AND m.role IN ('admin', 'editor')
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_users.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

DROP POLICY IF EXISTS "club_teams_public_read" ON public.club_teams;
CREATE POLICY "club_teams_public_read" ON public.club_teams
    FOR SELECT
    USING (
        status = 'active'
        AND EXISTS (
            SELECT 1
            FROM public.clubs c
            WHERE c.id = public.club_teams.club_id
              AND c.is_visible = TRUE
        )
    );

DROP POLICY IF EXISTS "club_teams_admin_manage" ON public.club_teams;
CREATE POLICY "club_teams_admin_manage" ON public.club_teams
    FOR ALL TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_teams.club_id
              AND m.role IN ('admin', 'editor')
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_teams.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

DROP POLICY IF EXISTS "team_memberships_public_read" ON public.team_memberships;
CREATE POLICY "team_memberships_public_read" ON public.team_memberships
    FOR SELECT
    USING (
        status = 'active'
        AND EXISTS (
            SELECT 1
            FROM public.club_teams ct
            JOIN public.clubs c ON c.id = ct.club_id
            WHERE ct.id IS NOT DISTINCT FROM public.team_memberships.team_id
              AND ct.status = 'active'
              AND c.is_visible = TRUE
        )
    );

DROP POLICY IF EXISTS "team_memberships_admin_manage" ON public.team_memberships;
CREATE POLICY "team_memberships_admin_manage" ON public.team_memberships
    FOR ALL TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.team_memberships.club_id
              AND m.role IN ('admin', 'editor')
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = 'club'
              AND m.scope_id = public.team_memberships.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

-- ============================================================
-- 4. BACKFILL SETTINGS Y USERS
-- ============================================================

INSERT INTO public.club_settings (club_id, is_managed, plan, features_enabled)
SELECT
    c.id,
    FALSE,
    'free',
    '{}'::jsonb
FROM public.clubs c
ON CONFLICT (club_id) DO NOTHING;

INSERT INTO public.club_users (club_id, user_id, role, status)
SELECT
    m.scope_id,
    m.user_id,
    CASE
        WHEN m.role = 'admin' THEN 'admin'
        WHEN m.role = 'editor' THEN 'editor'
        ELSE 'viewer'
    END,
    'active'
FROM public.memberships m
WHERE m.scope_type = 'club'
ON CONFLICT (club_id, user_id)
DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = NOW();

UPDATE public.club_settings cs
SET
    owner_user_id = owner_pick.user_id,
    is_managed = TRUE,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (club_id)
        club_id,
        user_id
    FROM public.club_users
    WHERE role IN ('owner', 'admin')
      AND status = 'active'
    ORDER BY club_id, CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at
) AS owner_pick
WHERE cs.club_id = owner_pick.club_id
  AND cs.owner_user_id IS NULL;

INSERT INTO public.club_users (club_id, user_id, role, status)
SELECT
    club_id,
    owner_user_id,
    'owner',
    'active'
FROM public.club_settings
WHERE owner_user_id IS NOT NULL
ON CONFLICT (club_id, user_id)
DO UPDATE SET
    role = 'owner',
    status = 'active',
    updated_at = NOW();

UPDATE public.club_settings cs
SET
    is_managed = TRUE,
    updated_at = NOW()
WHERE EXISTS (
        SELECT 1 FROM public.club_users cu
        WHERE cu.club_id = cs.club_id
          AND cu.status = 'active'
    )
   OR EXISTS (
        SELECT 1 FROM public.club_teams ct
        WHERE ct.club_id = cs.club_id
    );

-- ============================================================
-- 5. BACKFILL DE EQUIPOS / DIVISIONES
-- ============================================================

DO $$
BEGIN
    IF to_regclass('public.club_divisions') IS NOT NULL THEN
        INSERT INTO public.club_divisions (
            club_id,
            name,
            slug,
            sport,
            gender,
            category,
            status,
            featured,
            season
        )
        SELECT
            c.id,
            trimmed_category.category_name,
            regexp_replace(lower(trimmed_category.category_name), '[^a-z0-9]+', '-', 'g'),
            COALESCE(NULLIF(to_jsonb(c)->>'sport', ''), 'rugby'),
            'Masculino',
            trimmed_category.category_name,
            CASE WHEN COALESCE((to_jsonb(c)->>'is_visible')::BOOLEAN, FALSE) THEN 'active' ELSE 'draft' END,
            FALSE,
            EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
        FROM public.clubs c
        CROSS JOIN LATERAL (
            SELECT trim(category_name) AS category_name
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(to_jsonb(c)->'categories') = 'array' THEN to_jsonb(c)->'categories'
                    WHEN jsonb_typeof(to_jsonb(c)->'category') = 'string'
                        AND COALESCE(NULLIF(to_jsonb(c)->>'category', ''), '') <> ''
                        THEN jsonb_build_array(to_jsonb(c)->>'category')
                    ELSE '[]'::jsonb
                END
            ) AS category_name
            WHERE trim(category_name) <> ''
        ) AS trimmed_category
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.club_divisions d
            WHERE d.club_id = c.id
              AND lower(d.name) = lower(trimmed_category.category_name)
        );
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.club_divisions') IS NOT NULL THEN
        INSERT INTO public.club_teams (
            club_id,
            legacy_division_id,
            name,
            slug,
            sport,
            gender,
            category,
            status,
            featured,
            season,
            format,
            regulation,
            source
        )
        SELECT
            d.club_id,
            d.id,
            d.name,
            d.slug,
            d.sport,
            d.gender,
            d.category,
            d.status,
            COALESCE(d.featured, FALSE),
            d.season,
            d.format,
            d.regulation,
            'legacy_division'
        FROM public.club_divisions d
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.club_teams ct
            WHERE ct.club_id = d.club_id
              AND (
                  ct.legacy_division_id = d.id
                  OR lower(ct.name) = lower(d.name)
              )
        );
    END IF;
END $$;

DO $$
BEGIN
    INSERT INTO public.club_teams (
        club_id,
        legacy_division_id,
        name,
        slug,
        sport,
        gender,
        category,
        status,
        featured,
        season,
        source
    )
    SELECT
        c.id,
        NULL,
        trimmed_category.category_name,
        regexp_replace(lower(trimmed_category.category_name), '[^a-z0-9]+', '-', 'g'),
        COALESCE(NULLIF(to_jsonb(c)->>'sport', ''), 'rugby'),
        'Masculino',
        trimmed_category.category_name,
        CASE WHEN COALESCE((to_jsonb(c)->>'is_visible')::BOOLEAN, FALSE) THEN 'active' ELSE 'draft' END,
        FALSE,
        EXTRACT(YEAR FROM CURRENT_DATE)::TEXT,
        'legacy_category'
    FROM public.clubs c
    CROSS JOIN LATERAL (
        SELECT trim(category_name) AS category_name
        FROM jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(to_jsonb(c)->'categories') = 'array' THEN to_jsonb(c)->'categories'
                WHEN jsonb_typeof(to_jsonb(c)->'category') = 'string'
                    AND COALESCE(NULLIF(to_jsonb(c)->>'category', ''), '') <> ''
                    THEN jsonb_build_array(to_jsonb(c)->>'category')
                ELSE '[]'::jsonb
            END
        ) AS category_name
        WHERE trim(category_name) <> ''
    ) AS trimmed_category
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.club_teams ct
        WHERE ct.club_id = c.id
          AND lower(ct.name) = lower(trimmed_category.category_name)
    );
END $$;

UPDATE public.club_settings cs
SET
    is_managed = TRUE,
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM public.club_teams ct
    WHERE ct.club_id = cs.club_id
);

-- ============================================================
-- 6. BACKFILL DE MEMBRESIAS
-- ============================================================

DO $$
BEGIN
    IF to_regclass('public.club_person_roles') IS NOT NULL THEN
        INSERT INTO public.team_memberships (
            club_id,
            team_id,
            person_id,
            role,
            status,
            position,
            joined_at,
            left_at,
            source
        )
        SELECT
            cpr.club_id,
            ct.id,
            cpr.person_id,
            cpr.role,
            cpr.status,
            cpr.position,
            cpr.joined_at,
            cpr.left_at,
            'legacy_role'
        FROM public.club_person_roles cpr
        LEFT JOIN public.club_teams ct
            ON ct.club_id = cpr.club_id
           AND (
                ct.legacy_division_id = cpr.division_id
                OR ct.id = cpr.division_id
           )
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.team_memberships tm
            WHERE tm.club_id = cpr.club_id
              AND tm.person_id = cpr.person_id
              AND tm.role = cpr.role
              AND tm.team_id IS NOT DISTINCT FROM ct.id
        );
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.squad_members') IS NOT NULL
       AND to_regclass('public.club_divisions') IS NOT NULL THEN
        INSERT INTO public.team_memberships (
            club_id,
            team_id,
            person_id,
            role,
            status,
            position,
            jersey_number,
            squad_role,
            availability_status,
            notes,
            source
        )
        SELECT
            d.club_id,
            ct.id,
            sm.person_id,
            COALESCE(cpr.role, 'player'),
            COALESCE(cpr.status, 'active'),
            COALESCE(cpr.position, sm.position),
            sm.jersey_number,
            sm.role,
            sm.status,
            sm.notes,
            'legacy_squad'
        FROM public.squad_members sm
        JOIN public.club_divisions d
            ON d.id = sm.division_id
        LEFT JOIN public.club_person_roles cpr
            ON cpr.club_id = d.club_id
           AND cpr.person_id = sm.person_id
           AND cpr.division_id = sm.division_id
        LEFT JOIN public.club_teams ct
            ON ct.legacy_division_id = sm.division_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.team_memberships tm
            WHERE tm.club_id = d.club_id
              AND tm.person_id = sm.person_id
              AND tm.role = COALESCE(cpr.role, 'player')
              AND tm.team_id IS NOT DISTINCT FROM ct.id
        );

        UPDATE public.team_memberships tm
        SET
            jersey_number = COALESCE(tm.jersey_number, sm.jersey_number),
            squad_role = COALESCE(tm.squad_role, sm.role),
            availability_status = COALESCE(tm.availability_status, sm.status),
            notes = COALESCE(tm.notes, sm.notes),
            position = COALESCE(tm.position, sm.position),
            updated_at = NOW()
        FROM public.squad_members sm
        JOIN public.club_divisions d
            ON d.id = sm.division_id
        LEFT JOIN public.club_teams ct
            ON ct.legacy_division_id = sm.division_id
        WHERE tm.club_id = d.club_id
          AND tm.person_id = sm.person_id
          AND tm.team_id IS NOT DISTINCT FROM ct.id;
    END IF;
END $$;

COMMENT ON TABLE public.club_settings IS 'Management configuration overlay for a club. Extends clubs without duplicating the entity.';
COMMENT ON TABLE public.club_users IS 'Club-scoped management users for the private experience.';
COMMENT ON TABLE public.club_teams IS 'Operational teams/divisions that belong to the same canonical club.';
COMMENT ON TABLE public.team_memberships IS 'Assignments of people into club teams, preserving a single club with public and private experiences.';
