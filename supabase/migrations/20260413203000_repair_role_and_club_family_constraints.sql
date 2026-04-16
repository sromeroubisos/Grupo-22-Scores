BEGIN;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

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

ALTER TABLE public.memberships
    DROP CONSTRAINT IF EXISTS memberships_scope_type_check;

ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_scope_type_check
    CHECK (scope_type IN ('union', 'sport', 'tournament', 'match', 'club', 'club_family'));

ALTER TABLE public.memberships
    DROP CONSTRAINT IF EXISTS memberships_role_check;

ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('admin', 'editor', 'operator', 'viewer'));

COMMIT;
