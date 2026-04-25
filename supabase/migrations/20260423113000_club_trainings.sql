BEGIN;

CREATE TABLE IF NOT EXISTS public.club_trainings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    source_key TEXT NULL,
    source_kind TEXT NOT NULL DEFAULT 'manual',
    source_match_id UUID NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    division_id UUID NULL REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    training_type TEXT NOT NULL DEFAULT 'campo',
    status TEXT NOT NULL DEFAULT 'planificado',
    location TEXT NULL,
    objective TEXT NULL,
    source_label TEXT NULL,
    convocados INT NOT NULL DEFAULT 0,
    staff_names JSONB NOT NULL DEFAULT '[]'::jsonb,
    players_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    attendance JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluation JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_trainings_duration_minutes_check CHECK (duration_minutes > 0 AND duration_minutes <= 600),
    CONSTRAINT club_trainings_convocados_check CHECK (convocados >= 0),
    CONSTRAINT club_trainings_training_type_check CHECK (training_type IN ('campo', 'gimnasio', 'video', 'recuperacion')),
    CONSTRAINT club_trainings_status_check CHECK (status IN ('planificado', 'en_curso', 'finalizado', 'sin_evaluar')),
    CONSTRAINT club_trainings_staff_names_check CHECK (jsonb_typeof(staff_names) = 'array'),
    CONSTRAINT club_trainings_players_snapshot_check CHECK (jsonb_typeof(players_snapshot) = 'array'),
    CONSTRAINT club_trainings_attendance_check CHECK (jsonb_typeof(attendance) = 'object'),
    CONSTRAINT club_trainings_plan_blocks_check CHECK (jsonb_typeof(plan_blocks) = 'array'),
    CONSTRAINT club_trainings_evaluation_check CHECK (evaluation IS NULL OR jsonb_typeof(evaluation) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_club_trainings_club_id_scheduled_at
    ON public.club_trainings (club_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_trainings_source_match_id
    ON public.club_trainings (source_match_id)
    WHERE source_match_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_trainings_club_source_key_unique
    ON public.club_trainings (club_id, source_key)
    WHERE source_key IS NOT NULL;

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_trainings_set_updated_at ON public.club_trainings';
        EXECUTE 'CREATE TRIGGER club_trainings_set_updated_at
            BEFORE UPDATE ON public.club_trainings
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_trainings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_trainings_select ON public.club_trainings;
CREATE POLICY club_trainings_select
    ON public.club_trainings
    FOR SELECT
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_trainings.club_id, ARRAY['admin', 'editor', 'operator', 'viewer'])
    );

DROP POLICY IF EXISTS club_trainings_insert ON public.club_trainings;
CREATE POLICY club_trainings_insert
    ON public.club_trainings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_trainings.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_trainings_update ON public.club_trainings;
CREATE POLICY club_trainings_update
    ON public.club_trainings
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_trainings.club_id, ARRAY['admin', 'editor', 'operator'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_trainings.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_trainings_delete ON public.club_trainings;
CREATE POLICY club_trainings_delete
    ON public.club_trainings
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_trainings.club_id, ARRAY['admin', 'editor', 'operator'])
    );

COMMENT ON TABLE public.club_trainings IS 'Agenda operativa de entrenamientos por club con snapshots de plan, plantel, asistencia y evaluación.';
COMMENT ON COLUMN public.club_trainings.source_key IS 'Clave estable para sesiones derivadas del calendario (ej. previa o recuperación de un partido).';
COMMENT ON COLUMN public.club_trainings.players_snapshot IS 'Snapshot del plantel asociado al entrenamiento al momento de guardarlo.';
COMMENT ON COLUMN public.club_trainings.attendance IS 'Mapa playerId -> estado de asistencia.';
COMMENT ON COLUMN public.club_trainings.plan_blocks IS 'Bloques tácticos, técnicos y físicos de la sesión.';
COMMENT ON COLUMN public.club_trainings.evaluation IS 'Payload resumido del cierre de la sesión con carga, fatiga y observaciones.';

COMMIT;
