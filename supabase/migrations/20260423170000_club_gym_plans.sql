BEGIN;

CREATE TABLE IF NOT EXISTS public.club_gym_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    division_id UUID NULL REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    objective TEXT NULL,
    notes TEXT NULL,
    duration_minutes INT NOT NULL DEFAULT 0,
    plan_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_gym_plans_duration_minutes_check CHECK (duration_minutes >= 0 AND duration_minutes <= 600),
    CONSTRAINT club_gym_plans_plan_blocks_check CHECK (jsonb_typeof(plan_blocks) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_club_gym_plans_club_created
    ON public.club_gym_plans (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_gym_plans_club_division
    ON public.club_gym_plans (club_id, division_id);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_gym_plans_set_updated_at ON public.club_gym_plans';
        EXECUTE 'CREATE TRIGGER club_gym_plans_set_updated_at
            BEFORE UPDATE ON public.club_gym_plans
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_gym_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_gym_plans_select ON public.club_gym_plans;
CREATE POLICY club_gym_plans_select
    ON public.club_gym_plans
    FOR SELECT
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_gym_plans.club_id, ARRAY['admin', 'editor', 'operator', 'viewer'])
    );

DROP POLICY IF EXISTS club_gym_plans_insert ON public.club_gym_plans;
CREATE POLICY club_gym_plans_insert
    ON public.club_gym_plans
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_gym_plans.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_gym_plans_update ON public.club_gym_plans;
CREATE POLICY club_gym_plans_update
    ON public.club_gym_plans
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_gym_plans.club_id, ARRAY['admin', 'editor', 'operator'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_gym_plans.club_id, ARRAY['admin', 'editor', 'operator'])
    );

DROP POLICY IF EXISTS club_gym_plans_delete ON public.club_gym_plans;
CREATE POLICY club_gym_plans_delete
    ON public.club_gym_plans
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_gym_plans.club_id, ARRAY['admin', 'editor', 'operator'])
    );

COMMENT ON TABLE public.club_gym_plans IS 'Biblioteca de planes de gimnasio reutilizables para el staff del club.';
COMMENT ON COLUMN public.club_gym_plans.plan_blocks IS 'Bloques de trabajo del plan reusable.';

COMMIT;
