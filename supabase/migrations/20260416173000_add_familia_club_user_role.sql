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
            'familia_club',
            'operador',
            'gestor_deportes',
            'gestor_torneos',
            'gestor_partidos',
            'gestor_clubes'
        )
    );

COMMIT;
