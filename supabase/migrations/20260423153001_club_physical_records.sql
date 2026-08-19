BEGIN;

CREATE TABLE IF NOT EXISTS public.club_physical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    division_id UUID NULL REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    metric_label TEXT NOT NULL,
    value_numeric NUMERIC(10, 2) NOT NULL,
    unit TEXT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source TEXT NULL,
    notes TEXT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_physical_records_category_check CHECK (category IN ('weight', 'test')),
    CONSTRAINT club_physical_records_payload_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_club_physical_records_club_person_date
    ON public.club_physical_records (club_id, person_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_physical_records_club_category_metric
    ON public.club_physical_records (club_id, category, metric_key, recorded_at DESC);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_physical_records_set_updated_at ON public.club_physical_records';
        EXECUTE 'CREATE TRIGGER club_physical_records_set_updated_at
            BEFORE UPDATE ON public.club_physical_records
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_physical_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_physical_records_select ON public.club_physical_records;
CREATE POLICY club_physical_records_select
    ON public.club_physical_records
    FOR SELECT
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_records.club_id, ARRAY['admin', 'editor', 'operator', 'viewer'])
    );

DROP POLICY IF EXISTS club_physical_records_insert ON public.club_physical_records;
CREATE POLICY club_physical_records_insert
    ON public.club_physical_records
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_records.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_physical_records_update ON public.club_physical_records;
CREATE POLICY club_physical_records_update
    ON public.club_physical_records
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_records.club_id, ARRAY['admin', 'editor', 'operator'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_records.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_physical_records_delete ON public.club_physical_records;
CREATE POLICY club_physical_records_delete
    ON public.club_physical_records
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_physical_records.club_id, ARRAY['admin', 'editor', 'operator'])
    );

COMMENT ON TABLE public.club_physical_records IS 'Registros fisicos del club para seguimiento de pesos y testeos por jugador.';
COMMENT ON COLUMN public.club_physical_records.category IS 'weight para peso corporal, test para mediciones de testeos fisicos.';
COMMENT ON COLUMN public.club_physical_records.metric_key IS 'Clave tecnica de la medicion: body_weight, cmj, sprint_10m, etc.';
COMMENT ON COLUMN public.club_physical_records.metric_label IS 'Etiqueta legible de la medicion cargada por el staff.';
COMMENT ON COLUMN public.club_physical_records.payload IS 'Datos auxiliares del registro: intentos, contexto, observaciones estructuradas.';

COMMIT;
