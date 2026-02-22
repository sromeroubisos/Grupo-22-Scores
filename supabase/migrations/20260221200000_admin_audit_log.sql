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

-- Policies
-- SELECT: only super_admin (or users with the role 'super_admin' or similar, we will check what authorize_admin does, but typical is checking user role)
-- The prompt says "solo super_admin (o rol admin equivalente actual)"
-- Let's check how authorize_admin or the club editor works. The user mentions "solo super_admin (ideal)", we can check "public.users.role = 'super_admin'".
-- ACTUALLY, the prompt says "Policy SELECT: solo super_admin (o rol admin equivalente actual)" 
-- Let's do a SELECT policy that checks authorize_admin() if it exists, or just we can let authenticated users select if they are admins. Let's do authorize_admin().
-- The prompt says "Policy INSERT: permitir inserts solo al usuario logueado (authenticated) PERO restringido a super_admin (ideal)." Let's use authorize_admin() for INSERT as well, plus they must supply their own actor_user_id.

CREATE POLICY "Allow select for super_admins" ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.authorize_admin());

CREATE POLICY "Allow insert for actor" ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = actor_user_id AND public.authorize_admin());
