BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS memberships_self_select ON public.memberships;
CREATE POLICY memberships_self_select
    ON public.memberships
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_global_admin());

DROP POLICY IF EXISTS memberships_global_admin_manage ON public.memberships;
CREATE POLICY memberships_global_admin_manage
    ON public.memberships
    FOR ALL
    TO authenticated
    USING (public.is_global_admin())
    WITH CHECK (public.is_global_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
