BEGIN;

ALTER TABLE public.memberships
    DROP CONSTRAINT IF EXISTS memberships_scope_type_check;

ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_scope_type_check
    CHECK (scope_type IN ('union', 'sport', 'tournament', 'match', 'club', 'club_family'));

CREATE OR REPLACE FUNCTION public.resolve_club_family_root(p_club_id TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    WITH RECURSIVE lineage AS (
        SELECT p_club_id::TEXT AS club_id, 0 AS depth
        UNION ALL
        SELECT cd.base_club_id::TEXT, lineage.depth + 1
        FROM public.club_derivatives cd
        JOIN lineage
            ON cd.derived_club_id::TEXT = lineage.club_id
        WHERE cd.base_club_id::TEXT <> lineage.club_id
          AND lineage.depth < 25
    )
    SELECT COALESCE(
        (SELECT club_id FROM lineage ORDER BY depth DESC LIMIT 1),
        p_club_id
    );
$$;

CREATE OR REPLACE FUNCTION public.has_club_family_scope(
    p_club_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor']
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
            public.is_global_admin()
            OR EXISTS (
                SELECT 1
                FROM public.memberships m
                WHERE m.user_id = auth.uid()
                  AND m.scope_type = 'club_family'
                  AND m.role = ANY(p_allowed_roles)
                  AND public.resolve_club_family_root(m.scope_id::TEXT) = public.resolve_club_family_root(p_club_id)
            )
        );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_club_row(
    p_club_id TEXT,
    p_sport_id TEXT,
    p_union_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        public.is_global_admin()
        OR public.has_membership_scope('club', p_club_id, p_allowed_roles)
        OR public.has_club_family_scope(p_club_id, p_allowed_roles)
        OR public.has_membership_scope('sport', p_sport_id, p_allowed_roles)
        OR public.has_membership_scope('union', p_union_id, p_allowed_roles);
$$;

DROP POLICY IF EXISTS club_settings_access ON public.club_settings;
CREATE POLICY club_settings_access
    ON public.club_settings
    FOR ALL
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_settings.club_id, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_settings.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_users_access ON public.club_users;
CREATE POLICY club_users_access
    ON public.club_users
    FOR ALL
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_users.club_id, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_users.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_teams_select ON public.club_teams;
CREATE POLICY club_teams_select
    ON public.club_teams
    FOR SELECT
    TO anon, authenticated
    USING (
        (
            status = 'active'
            AND EXISTS (
                SELECT 1
                FROM public.clubs c
                WHERE c.id = public.club_teams.club_id
                  AND c.is_visible = TRUE
            )
        )
        OR public.authorize_admin()
        OR public.can_manage_club(public.club_teams.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_teams_insert ON public.club_teams;
CREATE POLICY club_teams_insert
    ON public.club_teams
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_teams.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_teams_update ON public.club_teams;
CREATE POLICY club_teams_update
    ON public.club_teams
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_teams.club_id, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_teams.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_teams_delete ON public.club_teams;
CREATE POLICY club_teams_delete
    ON public.club_teams
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_teams.club_id, ARRAY['admin', 'editor'])
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
        OR public.can_manage_club(public.team_memberships.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS team_memberships_insert ON public.team_memberships;
CREATE POLICY team_memberships_insert
    ON public.team_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.team_memberships.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS team_memberships_update ON public.team_memberships;
CREATE POLICY team_memberships_update
    ON public.team_memberships
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.team_memberships.club_id, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.team_memberships.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS team_memberships_delete ON public.team_memberships;
CREATE POLICY team_memberships_delete
    ON public.team_memberships
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.team_memberships.club_id, ARRAY['admin', 'editor'])
    );

COMMIT;
