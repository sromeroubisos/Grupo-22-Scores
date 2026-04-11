BEGIN;

-- Repair legacy schemas that still use `sport` without the later `sport_id`
-- additions expected by the helpers and RLS policies below.
DO $$
BEGIN
    IF to_regclass('public.clubs') IS NOT NULL THEN
        ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS sport_id TEXT;

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'clubs'
              AND column_name = 'sport'
        ) THEN
            EXECUTE $clubs$
                UPDATE public.clubs
                SET sport_id = sport
                WHERE sport_id IS NULL
                  AND sport IS NOT NULL
            $clubs$;
        END IF;
    END IF;

    IF to_regclass('public.tournaments') IS NOT NULL THEN
        ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS sport_id TEXT;

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'tournaments'
              AND column_name = 'sport'
        ) THEN
            EXECUTE $tournaments$
                UPDATE public.tournaments
                SET sport_id = sport
                WHERE sport_id IS NULL
                  AND sport IS NOT NULL
            $tournaments$;
        END IF;
    END IF;

    IF to_regclass('public.matches') IS NOT NULL THEN
        ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sport_id TEXT;
        ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sport TEXT;

        EXECUTE $matches$
            UPDATE public.matches AS m
            SET sport_id = COALESCE(
                m.sport_id,
                (
                    SELECT COALESCE(t.sport_id, t.sport)
                    FROM public.tournaments AS t
                    WHERE t.id = m.tournament_id
                    LIMIT 1
                ),
                (
                    SELECT COALESCE(c.sport_id, c.sport)
                    FROM public.clubs AS c
                    WHERE c.id = m.home_club_id
                    LIMIT 1
                ),
                (
                    SELECT COALESCE(c.sport_id, c.sport)
                    FROM public.clubs AS c
                    WHERE c.id = m.away_club_id
                    LIMIT 1
                )
            )
            WHERE m.sport_id IS NULL
        $matches$;
    END IF;
END $$;

-- Recreate the granular access helpers consumed by the policies below.
-- Some databases reached this migration without fully applying the
-- original granular access migration, so we repair the expected helpers
-- here before rebuilding RLS policies.
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

-- Keep an explicit helper for policies that historically allowed
-- super_admin, admin_general, and admin, but not wider operator access.
CREATE OR REPLACE FUNCTION public.is_content_admin()
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
          AND role IN ('super_admin', 'admin_general', 'admin')
    );
$$;

-- Remove duplicate / redundant indexes reported by the Supabase linter.
DROP INDEX IF EXISTS public.idx_clubs_country;
DROP INDEX IF EXISTS public.idx_clubs_union_id;
ALTER TABLE public.favorites
    DROP CONSTRAINT IF EXISTS favorites_user_id_entity_type_entity_id_key;
DROP INDEX IF EXISTS public.favorites_user_id_entity_type_entity_id_key;
DROP INDEX IF EXISTS public.idx_matches_away_club;
DROP INDEX IF EXISTS public.idx_matches_group;
DROP INDEX IF EXISTS public.idx_matches_home_club;
DROP INDEX IF EXISTS public.idx_matches_phase;
DROP INDEX IF EXISTS public.idx_matches_tournament;
DROP INDEX IF EXISTS public.idx_groups_phase;
DROP INDEX IF EXISTS public.idx_tournament_participants_club;
DROP INDEX IF EXISTS public.idx_tournament_participants_tournament;
DROP INDEX IF EXISTS public.idx_tournament_standings_lookup;
DROP INDEX IF EXISTS public.idx_standings_tournament_phase_group_position;
ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_tournament_id_phase_id_group_id_club_i_key;
DROP INDEX IF EXISTS public.tournament_standings_tournament_id_phase_id_group_id_club_i_key;

-- Drop existing policies on the affected tables so we can rebuild them
-- in a single-policy-per-action shape.
DO $$
DECLARE
    t TEXT;
    p RECORD;
    target_tables TEXT[] := ARRAY[
        'admin_audit_log',
        'categories',
        'club_aliases',
        'club_family_divisions',
        'club_person_roles',
        'club_profile',
        'club_secondary_unions',
        'club_settings',
        'club_teams',
        'club_users',
        'clubs',
        'competition_aliases',
        'countries',
        'external_tournament_standings_overrides',
        'external_tournaments',
        'favorites',
        'matches',
        'memberships',
        'people',
        'prode_competition_members',
        'prode_competitions',
        'prode_events',
        'prode_prediction_audit',
        'prode_predictions',
        'prode_private_league_members',
        'prode_private_leagues',
        'prode_rankings',
        'prode_user_totals',
        'sports',
        'team_labels',
        'team_memberships',
        'tournament_followers',
        'tournament_groups',
        'tournament_participants',
        'tournament_participants_audit',
        'tournament_phases',
        'tournament_rounds',
        'tournament_standings',
        'tournaments',
        'ui_labels',
        'unions',
        'user_export_presets',
        'user_favorite_leagues',
        'user_favorite_sports',
        'user_onboarding_status',
        'venue_aliases'
    ];
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF to_regclass(format('public.%I', t)) IS NULL THEN
            CONTINUE;
        END IF;

        FOR p IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
        END LOOP;
    END LOOP;
END $$;

-- categories
CREATE POLICY categories_select
    ON public.categories
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY categories_insert
    ON public.categories
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_content_admin());

CREATE POLICY categories_update
    ON public.categories
    FOR UPDATE
    TO authenticated
    USING (public.is_content_admin())
    WITH CHECK (public.is_content_admin());

CREATE POLICY categories_delete
    ON public.categories
    FOR DELETE
    TO authenticated
    USING (public.is_content_admin());

-- countries
CREATE POLICY countries_select
    ON public.countries
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY countries_insert
    ON public.countries
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_content_admin());

CREATE POLICY countries_update
    ON public.countries
    FOR UPDATE
    TO authenticated
    USING (public.is_content_admin())
    WITH CHECK (public.is_content_admin());

CREATE POLICY countries_delete
    ON public.countries
    FOR DELETE
    TO authenticated
    USING (public.is_content_admin());

-- sports
CREATE POLICY sports_select
    ON public.sports
    FOR SELECT
    TO anon, authenticated
    USING (
        is_visible = true
        OR public.can_manage_sport(id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY sports_insert
    ON public.sports
    FOR INSERT
    TO authenticated
    WITH CHECK (public.can_manage_sport(id::text, ARRAY['admin', 'editor']));

CREATE POLICY sports_update
    ON public.sports
    FOR UPDATE
    TO authenticated
    USING (public.can_manage_sport(id::text, ARRAY['admin', 'editor']))
    WITH CHECK (public.can_manage_sport(id::text, ARRAY['admin', 'editor']));

CREATE POLICY sports_delete
    ON public.sports
    FOR DELETE
    TO authenticated
    USING (public.can_manage_sport(id::text, ARRAY['admin', 'editor']));

-- unions
CREATE POLICY unions_select
    ON public.unions
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY unions_insert
    ON public.unions
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY unions_update
    ON public.unions
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY unions_delete
    ON public.unions
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- clubs
CREATE POLICY clubs_select
    ON public.clubs
    FOR SELECT
    TO anon, authenticated
    USING (
        is_visible = true
        OR public.can_manage_club_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

CREATE POLICY clubs_insert
    ON public.clubs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_manage_club_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

CREATE POLICY clubs_update
    ON public.clubs
    FOR UPDATE
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

CREATE POLICY clubs_delete
    ON public.clubs
    FOR DELETE
    TO authenticated
    USING (
        public.can_manage_club_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

-- tournaments
CREATE POLICY tournaments_select
    ON public.tournaments
    FOR SELECT
    TO anon, authenticated
    USING (
        (status IN ('active', 'published') AND is_visible = true)
        OR public.can_manage_tournament_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

CREATE POLICY tournaments_insert
    ON public.tournaments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_manage_tournament_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

CREATE POLICY tournaments_update
    ON public.tournaments
    FOR UPDATE
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

CREATE POLICY tournaments_delete
    ON public.tournaments
    FOR DELETE
    TO authenticated
    USING (
        public.can_manage_tournament_row(
            id::text,
            sport_id::text,
            union_id::text,
            ARRAY['admin', 'editor']
        )
    );

-- matches
CREATE POLICY matches_select
    ON public.matches
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY matches_insert
    ON public.matches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_manage_match_row(
            id::text,
            tournament_id::text,
            sport_id::text,
            ARRAY['admin', 'editor', 'operator']
        )
    );

CREATE POLICY matches_update
    ON public.matches
    FOR UPDATE
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

CREATE POLICY matches_delete
    ON public.matches
    FOR DELETE
    TO authenticated
    USING (
        public.can_manage_match_row(
            id::text,
            tournament_id::text,
            sport_id::text,
            ARRAY['admin', 'editor', 'operator']
        )
    );

-- tournament_phases / groups / rounds / participants / standings
CREATE POLICY tournament_phases_select
    ON public.tournament_phases
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_phases_insert
    ON public.tournament_phases
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_phases_update
    ON public.tournament_phases
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_phases_delete
    ON public.tournament_phases
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY tournament_groups_select
    ON public.tournament_groups
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_groups_insert
    ON public.tournament_groups
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_groups_update
    ON public.tournament_groups
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_groups_delete
    ON public.tournament_groups
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY tournament_rounds_select
    ON public.tournament_rounds
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_rounds_insert
    ON public.tournament_rounds
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_rounds_update
    ON public.tournament_rounds
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_rounds_delete
    ON public.tournament_rounds
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY tournament_participants_select
    ON public.tournament_participants
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_participants_insert
    ON public.tournament_participants
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_participants_update
    ON public.tournament_participants
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_participants_delete
    ON public.tournament_participants
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY tournament_standings_select
    ON public.tournament_standings
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_standings_insert
    ON public.tournament_standings
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_standings_update
    ON public.tournament_standings
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_standings_delete
    ON public.tournament_standings
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY tournament_participants_audit_select
    ON public.tournament_participants_audit
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_participants_audit_insert
    ON public.tournament_participants_audit
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_participants_audit_update
    ON public.tournament_participants_audit
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY tournament_participants_audit_delete
    ON public.tournament_participants_audit
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- club family / aliases / profiles / roles / people
CREATE POLICY club_family_divisions_select
    ON public.club_family_divisions
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY club_family_divisions_insert
    ON public.club_family_divisions
    FOR INSERT
    TO authenticated
    WITH CHECK (public.authorize_admin());

CREATE POLICY club_family_divisions_update
    ON public.club_family_divisions
    FOR UPDATE
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

CREATE POLICY club_family_divisions_delete
    ON public.club_family_divisions
    FOR DELETE
    TO authenticated
    USING (public.authorize_admin());

CREATE POLICY club_profile_select
    ON public.club_profile
    FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.clubs c
            WHERE c.id = public.club_profile.club_id
              AND c.is_visible = true
        )
        OR public.authorize_admin()
        OR public.can_manage_club(public.club_profile.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_profile_insert
    ON public.club_profile
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_profile.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_profile_update
    ON public.club_profile
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_profile.club_id::text, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_profile.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_profile_delete
    ON public.club_profile
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_profile.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_aliases_select
    ON public.club_aliases
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY club_aliases_insert
    ON public.club_aliases
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_content_admin()
        OR public.can_manage_club(public.club_aliases.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_aliases_update
    ON public.club_aliases
    FOR UPDATE
    TO authenticated
    USING (
        public.is_content_admin()
        OR public.can_manage_club(public.club_aliases.club_id::text, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.is_content_admin()
        OR public.can_manage_club(public.club_aliases.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_aliases_delete
    ON public.club_aliases
    FOR DELETE
    TO authenticated
    USING (
        public.is_content_admin()
        OR public.can_manage_club(public.club_aliases.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_secondary_unions_select
    ON public.club_secondary_unions
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY club_secondary_unions_insert
    ON public.club_secondary_unions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_secondary_unions.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_secondary_unions_update
    ON public.club_secondary_unions
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_secondary_unions.club_id::text, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_secondary_unions.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY club_secondary_unions_delete
    ON public.club_secondary_unions
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_secondary_unions.club_id::text, ARRAY['admin', 'editor'])
    );

CREATE POLICY competition_aliases_insert
    ON public.competition_aliases
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_content_admin());

CREATE POLICY competition_aliases_select
    ON public.competition_aliases
    FOR SELECT
    TO authenticated
    USING (public.is_content_admin());

CREATE POLICY competition_aliases_update
    ON public.competition_aliases
    FOR UPDATE
    TO authenticated
    USING (public.is_content_admin())
    WITH CHECK (public.is_content_admin());

CREATE POLICY competition_aliases_delete
    ON public.competition_aliases
    FOR DELETE
    TO authenticated
    USING (public.is_content_admin());

CREATE POLICY venue_aliases_select
    ON public.venue_aliases
    FOR SELECT
    TO authenticated
    USING (public.is_content_admin());

CREATE POLICY venue_aliases_insert
    ON public.venue_aliases
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_content_admin());

CREATE POLICY venue_aliases_update
    ON public.venue_aliases
    FOR UPDATE
    TO authenticated
    USING (public.is_content_admin())
    WITH CHECK (public.is_content_admin());

CREATE POLICY venue_aliases_delete
    ON public.venue_aliases
    FOR DELETE
    TO authenticated
    USING (public.is_content_admin());

CREATE POLICY people_select
    ON public.people
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY people_insert
    ON public.people
    FOR INSERT
    TO authenticated
    WITH CHECK (public.authorize_admin());

CREATE POLICY people_update
    ON public.people
    FOR UPDATE
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

CREATE POLICY people_delete
    ON public.people
    FOR DELETE
    TO authenticated
    USING (public.authorize_admin());

CREATE POLICY club_person_roles_select
    ON public.club_person_roles
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY club_person_roles_insert
    ON public.club_person_roles
    FOR INSERT
    TO authenticated
    WITH CHECK (public.authorize_admin());

CREATE POLICY club_person_roles_update
    ON public.club_person_roles
    FOR UPDATE
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

CREATE POLICY club_person_roles_delete
    ON public.club_person_roles
    FOR DELETE
    TO authenticated
    USING (public.authorize_admin());

-- labels
CREATE POLICY ui_labels_select
    ON public.ui_labels
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY ui_labels_insert
    ON public.ui_labels
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY ui_labels_update
    ON public.ui_labels
    FOR UPDATE
    TO authenticated
    USING ((select auth.role()) = 'authenticated')
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY ui_labels_delete
    ON public.ui_labels
    FOR DELETE
    TO authenticated
    USING ((select auth.role()) = 'authenticated');

CREATE POLICY team_labels_select
    ON public.team_labels
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY team_labels_insert
    ON public.team_labels
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY team_labels_update
    ON public.team_labels
    FOR UPDATE
    TO authenticated
    USING ((select auth.role()) = 'authenticated')
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY team_labels_delete
    ON public.team_labels
    FOR DELETE
    TO authenticated
    USING ((select auth.role()) = 'authenticated');

-- user-owned tables
CREATE POLICY favorites_select
    ON public.favorites
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id OR public.is_admin());

CREATE POLICY favorites_insert
    ON public.favorites
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id OR public.is_admin());

CREATE POLICY favorites_update
    ON public.favorites
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id OR public.is_admin())
    WITH CHECK ((select auth.uid()) = user_id OR public.is_admin());

CREATE POLICY favorites_delete
    ON public.favorites
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = user_id OR public.is_admin());

CREATE POLICY memberships_select
    ON public.memberships
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id OR public.is_global_admin());

CREATE POLICY memberships_insert
    ON public.memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_global_admin());

CREATE POLICY memberships_update
    ON public.memberships
    FOR UPDATE
    TO authenticated
    USING (public.is_global_admin())
    WITH CHECK (public.is_global_admin());

CREATE POLICY memberships_delete
    ON public.memberships
    FOR DELETE
    TO authenticated
    USING (public.is_global_admin());

CREATE POLICY user_export_presets_select
    ON public.user_export_presets
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_export_presets_insert
    ON public.user_export_presets
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_export_presets_update
    ON public.user_export_presets
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_export_presets_delete
    ON public.user_export_presets
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_sports_select
    ON public.user_favorite_sports
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_sports_insert
    ON public.user_favorite_sports
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_sports_update
    ON public.user_favorite_sports
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_sports_delete
    ON public.user_favorite_sports
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_leagues_select
    ON public.user_favorite_leagues
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_leagues_insert
    ON public.user_favorite_leagues
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_leagues_update
    ON public.user_favorite_leagues
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_favorite_leagues_delete
    ON public.user_favorite_leagues
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_onboarding_status_select
    ON public.user_onboarding_status
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY user_onboarding_status_insert
    ON public.user_onboarding_status
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_onboarding_status_update
    ON public.user_onboarding_status
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY user_onboarding_status_delete
    ON public.user_onboarding_status
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = user_id);

-- tournament followers
CREATE POLICY tournament_followers_select
    ON public.tournament_followers
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY tournament_followers_insert
    ON public.tournament_followers
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY tournament_followers_update
    ON public.tournament_followers
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY tournament_followers_delete
    ON public.tournament_followers
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = user_id);

-- admin audit log
CREATE POLICY admin_audit_log_select
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.authorize_admin());

CREATE POLICY admin_audit_log_insert
    ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (select auth.uid()) = actor_user_id
        AND public.authorize_admin()
    );

-- club management layer
CREATE POLICY club_settings_access
    ON public.club_settings
    FOR ALL
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
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
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_settings.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY club_users_access
    ON public.club_users
    FOR ALL
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
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
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_users.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

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
                  AND c.is_visible = true
            )
        )
        OR public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_teams.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY club_teams_insert
    ON public.club_teams
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_teams.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY club_teams_update
    ON public.club_teams
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
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
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_teams.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY club_teams_delete
    ON public.club_teams
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.club_teams.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

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
                  AND c.is_visible = true
            )
        )
        OR public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.team_memberships.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY team_memberships_insert
    ON public.team_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.team_memberships.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY team_memberships_update
    ON public.team_memberships
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
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
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.team_memberships.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

CREATE POLICY team_memberships_delete
    ON public.team_memberships
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = (select auth.uid())
              AND m.scope_type = 'club'
              AND m.scope_id = public.team_memberships.club_id
              AND m.role IN ('admin', 'editor')
        )
    );

-- authenticated write-only tables
CREATE POLICY external_tournaments_insert
    ON public.external_tournaments
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY external_tournaments_update
    ON public.external_tournaments
    FOR UPDATE
    TO authenticated
    USING ((select auth.role()) = 'authenticated')
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY external_tournament_standings_overrides_insert
    ON public.external_tournament_standings_overrides
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY external_tournament_standings_overrides_update
    ON public.external_tournament_standings_overrides
    FOR UPDATE
    TO authenticated
    USING ((select auth.role()) = 'authenticated')
    WITH CHECK ((select auth.role()) = 'authenticated');

-- Prode
CREATE POLICY prode_competitions_select
    ON public.prode_competitions
    FOR SELECT
    TO anon, authenticated
    USING (
        (
            visibility = 'public'
            AND status IN ('published', 'active', 'finished')
        )
        OR public.is_admin()
    );

CREATE POLICY prode_competitions_insert
    ON public.prode_competitions
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY prode_competitions_update
    ON public.prode_competitions
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY prode_competitions_delete
    ON public.prode_competitions
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_events_select
    ON public.prode_events
    FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.prode_competitions pc
            WHERE pc.id = competition_id
              AND pc.visibility = 'public'
              AND pc.status IN ('published', 'active', 'finished')
        )
        OR public.is_admin()
    );

CREATE POLICY prode_events_insert
    ON public.prode_events
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY prode_events_update
    ON public.prode_events
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY prode_events_delete
    ON public.prode_events
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_predictions_select
    ON public.prode_predictions
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id OR public.is_admin());

CREATE POLICY prode_predictions_insert
    ON public.prode_predictions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            (select auth.uid()) = user_id
            AND EXISTS (
                SELECT 1
                FROM public.prode_events pe
                WHERE pe.id = event_id
                  AND pe.competition_id = competition_id
                  AND pe.locks_at > now()
                  AND pe.status IN ('scheduled', 'live')
            )
        )
    );

CREATE POLICY prode_predictions_update
    ON public.prode_predictions
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            (select auth.uid()) = user_id
            AND EXISTS (
                SELECT 1
                FROM public.prode_events pe
                WHERE pe.id = event_id
                  AND pe.locks_at > now()
                  AND pe.status IN ('scheduled', 'live')
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            (select auth.uid()) = user_id
            AND EXISTS (
                SELECT 1
                FROM public.prode_events pe
                WHERE pe.id = event_id
                  AND pe.locks_at > now()
                  AND pe.status IN ('scheduled', 'live')
            )
        )
    );

CREATE POLICY prode_predictions_delete
    ON public.prode_predictions
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_competition_members_select
    ON public.prode_competition_members
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (select auth.uid()) = user_id
        OR EXISTS (
            SELECT 1
            FROM public.prode_competitions pc
            WHERE pc.id = competition_id
              AND pc.visibility = 'public'
              AND pc.status IN ('published', 'active', 'finished')
        )
    );

CREATE POLICY prode_competition_members_insert
    ON public.prode_competition_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            (select auth.uid()) = user_id
            AND EXISTS (
                SELECT 1
                FROM public.prode_competitions pc
                WHERE pc.id = competition_id
                  AND pc.status IN ('published', 'active')
                  AND pc.visibility IN ('public', 'unlisted')
            )
        )
    );

CREATE POLICY prode_competition_members_update
    ON public.prode_competition_members
    FOR UPDATE
    TO authenticated
    USING (public.is_admin() OR (select auth.uid()) = user_id)
    WITH CHECK (public.is_admin() OR (select auth.uid()) = user_id);

CREATE POLICY prode_competition_members_delete
    ON public.prode_competition_members
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_rankings_select
    ON public.prode_rankings
    FOR SELECT
    TO anon, authenticated
    USING (
        public.is_admin()
        OR (
            scope_type = 'global'
            AND EXISTS (
                SELECT 1
                FROM public.prode_competitions pc
                WHERE pc.id = competition_id
                  AND pc.visibility = 'public'
                  AND pc.status IN ('published', 'active', 'finished')
            )
        )
    );

CREATE POLICY prode_rankings_insert
    ON public.prode_rankings
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY prode_rankings_update
    ON public.prode_rankings
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY prode_rankings_delete
    ON public.prode_rankings
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_user_totals_select
    ON public.prode_user_totals
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY prode_user_totals_insert
    ON public.prode_user_totals
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY prode_user_totals_update
    ON public.prode_user_totals
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY prode_user_totals_delete
    ON public.prode_user_totals
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_private_leagues_select
    ON public.prode_private_leagues
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR owner_user_id = (select auth.uid())
        OR visibility = 'public'
        OR EXISTS (
            SELECT 1
            FROM public.prode_private_league_members plm
            WHERE plm.private_league_id = id
              AND plm.user_id = (select auth.uid())
        )
    );

CREATE POLICY prode_private_leagues_insert
    ON public.prode_private_leagues
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin() OR owner_user_id = (select auth.uid()));

CREATE POLICY prode_private_leagues_update
    ON public.prode_private_leagues
    FOR UPDATE
    TO authenticated
    USING (public.is_admin() OR owner_user_id = (select auth.uid()))
    WITH CHECK (public.is_admin() OR owner_user_id = (select auth.uid()));

CREATE POLICY prode_private_leagues_delete
    ON public.prode_private_leagues
    FOR DELETE
    TO authenticated
    USING (public.is_admin() OR owner_user_id = (select auth.uid()));

CREATE POLICY prode_private_league_members_select
    ON public.prode_private_league_members
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR user_id = (select auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.prode_private_leagues pll
            WHERE pll.id = private_league_id
              AND pll.owner_user_id = (select auth.uid())
        )
    );

CREATE POLICY prode_private_league_members_insert
    ON public.prode_private_league_members
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin() OR user_id = (select auth.uid()));

CREATE POLICY prode_private_league_members_update
    ON public.prode_private_league_members
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY prode_private_league_members_delete
    ON public.prode_private_league_members
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE POLICY prode_prediction_audit_select
    ON public.prode_prediction_audit
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.prode_predictions pp
            WHERE pp.id = prediction_id
              AND pp.user_id = (select auth.uid())
        )
    );

CREATE POLICY prode_prediction_audit_insert
    ON public.prode_prediction_audit
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY prode_prediction_audit_update
    ON public.prode_prediction_audit
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY prode_prediction_audit_delete
    ON public.prode_prediction_audit
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
