-- Allow club admins/editors to write to public.people and public.club_person_roles.
-- The 20260410123000_rls_lint_cleanup migration recreated these policies with only
-- public.authorize_admin() (super_admin / admin_general), which broke the club admin
-- panel: creating or editing a player raised "new row violates row-level security
-- policy for table 'people'". This migration restores the membership-scoped check
-- already applied to team_memberships and club_settings.

-- =====================
-- public.people
-- =====================

DROP POLICY IF EXISTS "people_admin_manage" ON public.people;
DROP POLICY IF EXISTS "people_admin_all"    ON public.people;
DROP POLICY IF EXISTS people_insert         ON public.people;
DROP POLICY IF EXISTS people_update         ON public.people;
DROP POLICY IF EXISTS people_delete         ON public.people;

CREATE POLICY people_insert
    ON public.people
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.memberships m
                WHERE m.user_id = (select auth.uid())
                  AND m.scope_type = 'club'
                  AND m.scope_id = public.people.club_id
                  AND m.role IN ('admin', 'editor')
            )
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
            AND EXISTS (
                SELECT 1
                FROM public.memberships m
                WHERE m.user_id = (select auth.uid())
                  AND m.scope_type = 'club'
                  AND m.scope_id = public.people.club_id
                  AND m.role IN ('admin', 'editor')
            )
        )
        OR EXISTS (
            SELECT 1
            FROM public.team_memberships tm
            JOIN public.memberships m
              ON m.user_id = (select auth.uid())
             AND m.scope_type = 'club'
             AND m.scope_id = tm.club_id
             AND m.role IN ('admin', 'editor')
            WHERE tm.person_id = public.people.id
        )
        OR EXISTS (
            SELECT 1
            FROM public.club_person_roles cpr
            JOIN public.memberships m
              ON m.user_id = (select auth.uid())
             AND m.scope_type = 'club'
             AND m.scope_id = cpr.club_id
             AND m.role IN ('admin', 'editor')
            WHERE cpr.person_id = public.people.id
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.memberships m
                WHERE m.user_id = (select auth.uid())
                  AND m.scope_type = 'club'
                  AND m.scope_id = public.people.club_id
                  AND m.role IN ('admin', 'editor')
            )
        )
        OR EXISTS (
            SELECT 1
            FROM public.team_memberships tm
            JOIN public.memberships m
              ON m.user_id = (select auth.uid())
             AND m.scope_type = 'club'
             AND m.scope_id = tm.club_id
             AND m.role IN ('admin', 'editor')
            WHERE tm.person_id = public.people.id
        )
        OR EXISTS (
            SELECT 1
            FROM public.club_person_roles cpr
            JOIN public.memberships m
              ON m.user_id = (select auth.uid())
             AND m.scope_type = 'club'
             AND m.scope_id = cpr.club_id
             AND m.role IN ('admin', 'editor')
            WHERE cpr.person_id = public.people.id
        )
    );

CREATE POLICY people_delete
    ON public.people
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.memberships m
                WHERE m.user_id = (select auth.uid())
                  AND m.scope_type = 'club'
                  AND m.scope_id = public.people.club_id
                  AND m.role IN ('admin', 'editor')
            )
        )
        OR EXISTS (
            SELECT 1
            FROM public.team_memberships tm
            JOIN public.memberships m
              ON m.user_id = (select auth.uid())
             AND m.scope_type = 'club'
             AND m.scope_id = tm.club_id
             AND m.role IN ('admin', 'editor')
            WHERE tm.person_id = public.people.id
        )
        OR EXISTS (
            SELECT 1
            FROM public.club_person_roles cpr
            JOIN public.memberships m
              ON m.user_id = (select auth.uid())
             AND m.scope_type = 'club'
             AND m.scope_id = cpr.club_id
             AND m.role IN ('admin', 'editor')
            WHERE cpr.person_id = public.people.id
        )
    );

-- =====================
-- public.club_person_roles
-- =====================

DROP POLICY IF EXISTS club_person_roles_insert ON public.club_person_roles;
DROP POLICY IF EXISTS club_person_roles_update ON public.club_person_roles;
DROP POLICY IF EXISTS club_person_roles_delete ON public.club_person_roles;

CREATE POLICY club_person_roles_insert
    ON public.club_person_roles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_person_roles.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY club_person_roles_update
    ON public.club_person_roles
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_person_roles.club_id
              AND m.role IN ('admin', 'editor')
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_person_roles.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY club_person_roles_delete
    ON public.club_person_roles
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_person_roles.club_id
              AND m.role IN ('admin', 'editor')
        )
    );
