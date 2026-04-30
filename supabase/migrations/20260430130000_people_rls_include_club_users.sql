-- The 20260430120000 widening still left out the legacy `club_users`
-- table, which is the actual authority used by the club-admin onboarding
-- flow (it predates the unified `memberships` model). Cuentas creadas
-- vía el panel super-admin reciben fila en `public.club_users` con role
-- `owner|admin|editor`, pero pueden no tener `memberships` row, y por
-- eso la RLS de `people` las sigue rechazando aunque la UI las deja
-- entrar al panel. Ampliamos el chequeo para incluir esa ruta.

-- ============================================================
-- Helper: ¿puede el usuario actual gestionar este club?
-- Combina can_manage_club() (memberships + family + sport + union)
-- con club_users (legacy/onboarding path).
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_can_manage_club_people(
    p_club_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor', 'operator']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        p_club_id IS NOT NULL
        AND (
            public.can_manage_club(p_club_id, p_allowed_roles)
            OR EXISTS (
                SELECT 1
                FROM public.club_users cu
                WHERE cu.club_id = p_club_id
                  AND cu.user_id = auth.uid()
                  AND cu.status = 'active'
                  AND cu.role IN ('owner', 'admin', 'editor')
            )
        );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_manage_club_people(TEXT, TEXT[]) TO authenticated;

-- ============================================================
-- Helper: ¿pertenece la persona a algún club gestionado por el user?
-- Reescrito sobre user_can_manage_club_people para incluir club_users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.person_in_user_managed_club(
    p_person_id UUID,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor', 'operator']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_memberships tm
        WHERE tm.person_id = p_person_id
          AND tm.club_id IS NOT NULL
          AND public.user_can_manage_club_people(tm.club_id, p_allowed_roles)
    )
    OR EXISTS (
        SELECT 1
        FROM public.club_person_roles cpr
        WHERE cpr.person_id = p_person_id
          AND cpr.club_id IS NOT NULL
          AND public.user_can_manage_club_people(cpr.club_id, p_allowed_roles)
    );
$$;

GRANT EXECUTE ON FUNCTION public.person_in_user_managed_club(UUID, TEXT[]) TO authenticated;

-- ============================================================
-- Re-create people / club_person_roles / team_memberships policies
-- on top of the new helper.
-- ============================================================

DROP POLICY IF EXISTS people_insert ON public.people;
DROP POLICY IF EXISTS people_update ON public.people;
DROP POLICY IF EXISTS people_delete ON public.people;

CREATE POLICY people_insert
    ON public.people
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND public.user_can_manage_club_people(public.people.club_id)
        )
    );

CREATE POLICY people_update
    ON public.people
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND public.user_can_manage_club_people(public.people.club_id)
        )
        OR public.person_in_user_managed_club(public.people.id)
    )
    WITH CHECK (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND public.user_can_manage_club_people(public.people.club_id)
        )
        OR public.person_in_user_managed_club(public.people.id)
    );

CREATE POLICY people_delete
    ON public.people
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND public.user_can_manage_club_people(public.people.club_id)
        )
        OR public.person_in_user_managed_club(public.people.id)
    );

DROP POLICY IF EXISTS club_person_roles_insert ON public.club_person_roles;
DROP POLICY IF EXISTS club_person_roles_update ON public.club_person_roles;
DROP POLICY IF EXISTS club_person_roles_delete ON public.club_person_roles;

CREATE POLICY club_person_roles_insert
    ON public.club_person_roles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.club_person_roles.club_id)
    );

CREATE POLICY club_person_roles_update
    ON public.club_person_roles
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.club_person_roles.club_id)
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.club_person_roles.club_id)
    );

CREATE POLICY club_person_roles_delete
    ON public.club_person_roles
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.club_person_roles.club_id)
    );

DROP POLICY IF EXISTS team_memberships_select ON public.team_memberships;
CREATE POLICY team_memberships_select
    ON public.team_memberships
    FOR SELECT
    TO anon, authenticated
    USING (
        (
            status = 'active'
            AND EXISTS (
                SELECT 1
                FROM public.club_teams ct
                JOIN public.clubs c ON c.id = ct.club_id
                WHERE ct.id IS NOT DISTINCT FROM public.team_memberships.team_id
                  AND ct.status = 'active'
                  AND c.is_visible = TRUE
            )
        )
        OR public.authorize_admin()
        OR public.user_can_manage_club_people(public.team_memberships.club_id)
    );

DROP POLICY IF EXISTS team_memberships_insert ON public.team_memberships;
CREATE POLICY team_memberships_insert
    ON public.team_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.team_memberships.club_id)
    );

DROP POLICY IF EXISTS team_memberships_update ON public.team_memberships;
CREATE POLICY team_memberships_update
    ON public.team_memberships
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.team_memberships.club_id)
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.team_memberships.club_id)
    );

DROP POLICY IF EXISTS team_memberships_delete ON public.team_memberships;
CREATE POLICY team_memberships_delete
    ON public.team_memberships
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.user_can_manage_club_people(public.team_memberships.club_id)
    );

NOTIFY pgrst, 'reload schema';
