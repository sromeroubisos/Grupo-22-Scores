BEGIN;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (
        role IN (
            'fan',
            'user',
            'super_admin',
            'operator',
            'club_admin',
            'admin_general',
            'admin',
            'admin_union',
            'admin_torneo',
            'admin_club',
            'operador',
            'gestor_deportes',
            'gestor_torneos',
            'gestor_partidos',
            'gestor_clubes'
        )
    );

CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_scope_type_check;
ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_scope_type_check
    CHECK (scope_type IN ('union', 'sport', 'tournament', 'match', 'club'));

ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('admin', 'editor', 'operator', 'viewer'));

CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_scope_unique_idx
    ON public.memberships (user_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS memberships_user_idx
    ON public.memberships (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memberships_scope_idx
    ON public.memberships (scope_type, scope_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'admin_general')
    );
$$;

CREATE OR REPLACE FUNCTION public.has_membership_scope(
    p_scope_type TEXT,
    p_scope_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor', 'operator']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        public.is_global_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type = p_scope_type
              AND m.scope_id = p_scope_id
              AND m.role = ANY(p_allowed_roles)
        );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_sport(
    p_sport_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT public.has_membership_scope('sport', p_sport_id, p_allowed_roles);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tournament_row(
    p_tournament_id TEXT,
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
        OR public.has_membership_scope('tournament', p_tournament_id, p_allowed_roles)
        OR public.has_membership_scope('sport', p_sport_id, p_allowed_roles)
        OR public.has_membership_scope('union', p_union_id, p_allowed_roles);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tournament(
    p_tournament_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.tournaments t
        WHERE t.id::text = p_tournament_id
          AND public.can_manage_tournament_row(
              t.id::text,
              t.sport_id::text,
              t.union_id::text,
              p_allowed_roles
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
        OR public.has_membership_scope('sport', p_sport_id, p_allowed_roles)
        OR public.has_membership_scope('union', p_union_id, p_allowed_roles);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_club(
    p_club_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.clubs c
        WHERE c.id::text = p_club_id
          AND public.can_manage_club_row(
              c.id::text,
              c.sport_id::text,
              c.union_id::text,
              p_allowed_roles
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_match_row(
    p_match_id TEXT,
    p_tournament_id TEXT,
    p_sport_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor', 'operator']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        public.is_global_admin()
        OR public.has_membership_scope('match', p_match_id, p_allowed_roles)
        OR public.has_membership_scope('tournament', p_tournament_id, p_allowed_roles)
        OR public.has_membership_scope('sport', p_sport_id, p_allowed_roles)
        OR EXISTS (
            SELECT 1
            FROM public.tournaments t
            WHERE t.id::text = p_tournament_id
              AND public.has_membership_scope('union', t.union_id::text, p_allowed_roles)
        );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_match(
    p_match_id TEXT,
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
        FROM public.matches m
        LEFT JOIN public.tournaments t ON t.id = m.tournament_id
        WHERE m.id::text = p_match_id
          AND public.can_manage_match_row(
              m.id::text,
              m.tournament_id::text,
              COALESCE(m.sport_id::text, t.sport_id::text, m.sport::text),
              p_allowed_roles
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_phase(
    p_phase_id TEXT,
    p_allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor']
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.tournament_phases tp
        WHERE tp.id::text = p_phase_id
          AND public.can_manage_tournament(tp.tournament_id::text, p_allowed_roles)
    );
$$;

DROP POLICY IF EXISTS memberships_self_select ON public.memberships;
DROP POLICY IF EXISTS memberships_global_admin_manage ON public.memberships;

CREATE POLICY memberships_self_select
    ON public.memberships
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_global_admin());

CREATE POLICY memberships_global_admin_manage
    ON public.memberships
    FOR ALL
    TO authenticated
    USING (public.is_global_admin())
    WITH CHECK (public.is_global_admin());

DROP POLICY IF EXISTS admin_all_sports ON public.sports;
DROP POLICY IF EXISTS sports_manage_granular ON public.sports;
CREATE POLICY sports_manage_granular
    ON public.sports
    FOR ALL
    TO authenticated
    USING (public.can_manage_sport(id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_sport(id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS admin_all_tournaments ON public.tournaments;
DROP POLICY IF EXISTS tournaments_manage_granular ON public.tournaments;
CREATE POLICY tournaments_manage_granular
    ON public.tournaments
    FOR ALL
    TO authenticated
    USING (
        public.can_manage_tournament_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    )
    WITH CHECK (
        public.can_manage_tournament_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

DROP POLICY IF EXISTS admin_all_clubs ON public.clubs;
DROP POLICY IF EXISTS clubs_manage_granular ON public.clubs;
CREATE POLICY clubs_manage_granular
    ON public.clubs
    FOR ALL
    TO authenticated
    USING (
        public.can_manage_club_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    )
    WITH CHECK (
        public.can_manage_club_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

DROP POLICY IF EXISTS admin_all_matches ON public.matches;
DROP POLICY IF EXISTS matches_manage_granular ON public.matches;
CREATE POLICY matches_manage_granular
    ON public.matches
    FOR ALL
    TO authenticated
    USING (
        public.can_manage_match_row(
            id::text,
            tournament_id::text,
            sport_id::text,
            ARRAY['admin', 'editor', 'operator']
        )
    )
    WITH CHECK (
        public.can_manage_match_row(
            id::text,
            tournament_id::text,
            sport_id::text,
            ARRAY['admin', 'editor', 'operator']
        )
    );

DROP POLICY IF EXISTS club_divisions_manage_granular ON public.club_divisions;
CREATE POLICY club_divisions_manage_granular
    ON public.club_divisions
    FOR ALL
    TO authenticated
    USING (public.can_manage_club(club_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_club(club_id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS club_venues_manage_granular ON public.club_venues;
CREATE POLICY club_venues_manage_granular
    ON public.club_venues
    FOR ALL
    TO authenticated
    USING (public.can_manage_club(club_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_club(club_id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS tournament_phases_manage_granular ON public.tournament_phases;
CREATE POLICY tournament_phases_manage_granular
    ON public.tournament_phases
    FOR ALL
    TO authenticated
    USING (public.can_manage_tournament(tournament_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_tournament(tournament_id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS tournament_groups_manage_granular ON public.tournament_groups;
CREATE POLICY tournament_groups_manage_granular
    ON public.tournament_groups
    FOR ALL
    TO authenticated
    USING (public.can_manage_phase(phase_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_phase(phase_id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS tournament_rounds_manage_granular ON public.tournament_rounds;
CREATE POLICY tournament_rounds_manage_granular
    ON public.tournament_rounds
    FOR ALL
    TO authenticated
    USING (public.can_manage_phase(phase_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_phase(phase_id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS tournament_participants_manage_granular ON public.tournament_participants;
CREATE POLICY tournament_participants_manage_granular
    ON public.tournament_participants
    FOR ALL
    TO authenticated
    USING (public.can_manage_tournament(tournament_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_tournament(tournament_id::text, ARRAY['admin', 'editor']));

DROP POLICY IF EXISTS tournament_standings_manage_granular ON public.tournament_standings;
CREATE POLICY tournament_standings_manage_granular
    ON public.tournament_standings
    FOR ALL
    TO authenticated
    USING (public.can_manage_tournament(tournament_id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_tournament(tournament_id::text, ARRAY['admin', 'editor']));

COMMIT;
