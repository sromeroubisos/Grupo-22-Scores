BEGIN;

CREATE TABLE IF NOT EXISTS public.club_physical_test_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    division_id UUID NULL REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    metric_key TEXT NOT NULL,
    label TEXT NOT NULL,
    unit TEXT NULL,
    better_value_direction TEXT NOT NULL DEFAULT 'higher',
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_physical_test_definitions_metric_key_unique UNIQUE (club_id, metric_key),
    CONSTRAINT club_physical_test_definitions_direction_check CHECK (better_value_direction IN ('higher', 'lower'))
);

CREATE INDEX IF NOT EXISTS idx_club_physical_test_definitions_club_division
    ON public.club_physical_test_definitions (club_id, division_id, is_active, label);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_physical_test_definitions_set_updated_at ON public.club_physical_test_definitions';
        EXECUTE 'CREATE TRIGGER club_physical_test_definitions_set_updated_at
            BEFORE UPDATE ON public.club_physical_test_definitions
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_physical_test_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_physical_test_definitions_select ON public.club_physical_test_definitions;
CREATE POLICY club_physical_test_definitions_select
    ON public.club_physical_test_definitions
    FOR SELECT
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_test_definitions.club_id, ARRAY['admin', 'editor', 'operator', 'viewer'])
    );

DROP POLICY IF EXISTS club_physical_test_definitions_insert ON public.club_physical_test_definitions;
CREATE POLICY club_physical_test_definitions_insert
    ON public.club_physical_test_definitions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_test_definitions.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_physical_test_definitions_update ON public.club_physical_test_definitions;
CREATE POLICY club_physical_test_definitions_update
    ON public.club_physical_test_definitions
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_test_definitions.club_id, ARRAY['admin', 'editor', 'operator'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_test_definitions.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_physical_test_definitions_delete ON public.club_physical_test_definitions;
CREATE POLICY club_physical_test_definitions_delete
    ON public.club_physical_test_definitions
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_test_definitions.club_id, ARRAY['admin', 'editor', 'operator'])
    );

COMMENT ON TABLE public.club_physical_test_definitions IS 'Catalogo de testeos fisicos definidos por el PF para cada club.';
COMMENT ON COLUMN public.club_physical_test_definitions.metric_key IS 'Clave tecnica unica del test dentro del club.';
COMMENT ON COLUMN public.club_physical_test_definitions.better_value_direction IS 'Indica si un valor mas alto o mas bajo representa un mejor resultado.';

COMMIT;
