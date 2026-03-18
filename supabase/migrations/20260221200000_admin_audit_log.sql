-- Migration: 20260221200000_admin_audit_log.sql
-- Create admin_audit_log table

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    actor_user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL DEFAULT 'update',
    changes jsonb NOT NULL,
    request_id text NULL,
    source text NULL,
    CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id)
);

-- Creating indices
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx ON public.admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON public.admin_audit_log (actor_user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS "Allow select for super_admins" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;

CREATE POLICY "Allow select for super_admins" ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.authorize_admin());

CREATE POLICY "Allow insert for actor" ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = actor_user_id AND public.authorize_admin());
