CREATE TABLE IF NOT EXISTS public.club_derivatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    derived_club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    derivative_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_derivatives_unique UNIQUE (base_club_id, derived_club_id),
    CONSTRAINT club_derivatives_distinct CHECK (base_club_id <> derived_club_id)
);

ALTER TABLE public.club_derivatives
    DROP CONSTRAINT IF EXISTS club_derivatives_derivative_type_check;

ALTER TABLE public.club_derivatives
    ADD CONSTRAINT club_derivatives_derivative_type_check
    CHECK (derivative_type IN ('family', 'youth', 'women', 'other_sport', 'divisions'));

CREATE INDEX IF NOT EXISTS idx_club_derivatives_base_club_id
    ON public.club_derivatives (base_club_id);

CREATE INDEX IF NOT EXISTS idx_club_derivatives_derived_club_id
    ON public.club_derivatives (derived_club_id);

CREATE INDEX IF NOT EXISTS idx_club_derivatives_type
    ON public.club_derivatives (derivative_type);

ALTER TABLE public.club_derivatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_derivatives_public_read" ON public.club_derivatives;
CREATE POLICY "club_derivatives_public_read" ON public.club_derivatives
    FOR SELECT
    USING (true);

DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "club_derivatives_admin_manage" ON public.club_derivatives';
        EXECUTE 'CREATE POLICY "club_derivatives_admin_manage" ON public.club_derivatives
            FOR ALL TO authenticated
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';
    END IF;
END $$;

COMMENT ON TABLE public.club_derivatives IS
    'Links a base club with related clubs in the same operational family.';

COMMENT ON COLUMN public.club_derivatives.derivative_type IS
    'Internal relationship marker. Club families created from the super admin panel use family.';
