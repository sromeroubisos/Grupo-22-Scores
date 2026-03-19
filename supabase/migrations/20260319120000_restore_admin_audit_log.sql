-- Restore admin_audit_log table and authorize_admin function
-- Migration: 20260319120000_restore_admin_audit_log.sql

-- 1. Ensure authorize_admin exists
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin_general')
  );
$$;

-- 2. Create admin_audit_log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    actor_user_id  uuid        NOT NULL,
    entity_type    text        NOT NULL,
    entity_id      text        NOT NULL,
    action         text        NOT NULL DEFAULT 'update',
    changes        jsonb       NOT NULL,
    request_id     text            NULL,
    source         text            NULL,
    CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id)
);

-- 3. Create indices
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx
    ON public.admin_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
    ON public.admin_audit_log (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
    ON public.admin_audit_log (action, created_at DESC);

-- 4. Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 5. Grants
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

-- 6. Policies
DROP POLICY IF EXISTS "Allow select for super_admins" ON public.admin_audit_log;
CREATE POLICY "Allow select for super_admins"
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.authorize_admin());

DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;
CREATE POLICY "Allow insert for actor"
    ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = actor_user_id
        AND public.authorize_admin()
    );
