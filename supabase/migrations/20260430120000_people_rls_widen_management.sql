-- Widen people / club_person_roles RLS policies so that the entire club
-- management surface (admin / editor / operator) and club-family scoped
-- users can edit player and staff records. The 20260429170000 migration
-- restored membership-scoped checks but kept the old 'admin'|'editor'
-- whitelist and inlined the EXISTS joins on team_memberships /
-- club_person_roles. Because team_memberships SELECT itself is RLS
-- restricted, those EXISTS subqueries were silently filtered for some
-- users, leaving UPDATE statements without affected rows and causing
-- "No se pudo actualizar el jugador" errors in the UI.

-- ============================================================
-- Helper: does the current user manage any club this person belongs to?
-- Runs SECURITY DEFINER so the inner EXISTS bypasses RLS on
-- team_memberships / club_person_roles. Reuses can_manage_club() which
-- already understands club + club_family + sport + union memberships.
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
          AND public.can_manage_club(tm.club_id, p_allowed_roles)
    )
    OR EXISTS (
        SELECT 1
        FROM public.club_person_roles cpr
        WHERE cpr.person_id = p_person_id
          AND cpr.club_id IS NOT NULL
          AND public.can_manage_club(cpr.club_id, p_allowed_roles)
    );
$$;

GRANT EXECUTE ON FUNCTION public.person_in_user_managed_club(UUID, TEXT[]) TO authenticated;

-- ============================================================
-- public.people policies
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
            AND public.can_manage_club(
                public.people.club_id,
                ARRAY['admin', 'editor', 'operator']
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
            AND public.can_manage_club(
                public.people.club_id,
                ARRAY['admin', 'editor', 'operator']
            )
        )
        OR public.person_in_user_managed_club(
            public.people.id,
            ARRAY['admin', 'editor', 'operator']
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR (
            public.people.club_id IS NOT NULL
            AND public.can_manage_club(
                public.people.club_id,
                ARRAY['admin', 'editor', 'operator']
            )
        )
        OR public.person_in_user_managed_club(
            public.people.id,
            ARRAY['admin', 'editor', 'operator']
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
            AND public.can_manage_club(
                public.people.club_id,
                ARRAY['admin', 'editor', 'operator']
            )
        )
        OR public.person_in_user_managed_club(
            public.people.id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

-- ============================================================
-- public.club_person_roles policies (mirror, also widen roles)
-- ============================================================

DROP POLICY IF EXISTS club_person_roles_insert ON public.club_person_roles;
DROP POLICY IF EXISTS club_person_roles_update ON public.club_person_roles;
DROP POLICY IF EXISTS club_person_roles_delete ON public.club_person_roles;

CREATE POLICY club_person_roles_insert
    ON public.club_person_roles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(
            public.club_person_roles.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

CREATE POLICY club_person_roles_update
    ON public.club_person_roles
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(
            public.club_person_roles.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(
            public.club_person_roles.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

CREATE POLICY club_person_roles_delete
    ON public.club_person_roles
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(
            public.club_person_roles.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

-- ============================================================
-- public.team_memberships: align write policies with the same role
-- whitelist so admin_club operators can manage squad assignments too.
-- SELECT policy keeps its public-visibility branch and is rewritten to
-- accept the wider role set as well, so EXISTS subqueries from other
-- policies see the rows.
-- ============================================================

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
        OR public.can_manage_club(
            public.team_memberships.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

DROP POLICY IF EXISTS team_memberships_insert ON public.team_memberships;
CREATE POLICY team_memberships_insert
    ON public.team_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(
            public.team_memberships.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

DROP POLICY IF EXISTS team_memberships_update ON public.team_memberships;
CREATE POLICY team_memberships_update
    ON public.team_memberships
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(
            public.team_memberships.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(
            public.team_memberships.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

DROP POLICY IF EXISTS team_memberships_delete ON public.team_memberships;
CREATE POLICY team_memberships_delete
    ON public.team_memberships
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(
            public.team_memberships.club_id,
            ARRAY['admin', 'editor', 'operator']
        )
    );

-- ============================================================
-- One-shot data backfill: people.club_id was historically left NULL by
-- the safePayload fallback in insertPersonRecord. Restore it for
-- unambiguous cases (person belongs to exactly one club through
-- team_memberships or club_person_roles).
-- ============================================================

UPDATE public.people p
SET club_id = sub.club_id,
    updated_at = NOW()
FROM (
    SELECT person_id,
           MIN(club_id) AS club_id,
           COUNT(DISTINCT club_id) AS clubs
    FROM (
        SELECT person_id, club_id
        FROM public.team_memberships
        WHERE club_id IS NOT NULL
        UNION
        SELECT person_id, club_id
        FROM public.club_person_roles
        WHERE club_id IS NOT NULL
    ) s
    GROUP BY person_id
    HAVING COUNT(DISTINCT club_id) = 1
) sub
WHERE p.id = sub.person_id
  AND p.club_id IS NULL;

NOTIFY pgrst, 'reload schema';
