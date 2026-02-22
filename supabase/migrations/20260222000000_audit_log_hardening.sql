-- =============================================================================
-- Migration: admin_audit_log hardening
-- Created:   2026-02-22
-- Purpose:   Enforce that only service_role can INSERT into admin_audit_log.
--            Authenticated users can SELECT their own rows; anon has no access.
--            All statements are idempotent (safe to re-run).
-- =============================================================================

-- 1. Enable RLS (idempotent: ALTER TABLE IF RLS already ON is a no-op)
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS even for table owners (prevents accidental owner-bypass)
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;

-- 3. Revoke INSERT from roles that must NOT write directly
--    REVOKE is idempotent — no error if the privilege was never granted.
REVOKE INSERT ON public.admin_audit_log FROM anon;
REVOKE INSERT ON public.admin_audit_log FROM authenticated;

-- 4. Ensure service_role has full access (it bypasses RLS by design,
--    but explicitly granting avoids surprises after schema migrations).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_log TO service_role;

-- 5. DROP + recreate SELECT policy (DROP IF EXISTS = idempotent)
DROP POLICY IF EXISTS "audit_log_select_own" ON public.admin_audit_log;
CREATE POLICY "audit_log_select_own"
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (actor_user_id = auth.uid());

-- 6. Explicit DENY policy for INSERT by authenticated
--    A RESTRICTIVE policy blocks even if other policies would allow it.
DROP POLICY IF EXISTS "audit_log_deny_insert_authenticated" ON public.admin_audit_log;
CREATE POLICY "audit_log_deny_insert_authenticated"
    ON public.admin_audit_log
    AS RESTRICTIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

-- =============================================================================
-- VERIFICATION QUERIES  (run manually after migration — expected results below)
-- =============================================================================

-- A) Check RLS is enabled and forced
-- Expected: relrowsecurity=true, relforcerowsecurity=true
SELECT relname, relrowsecurity, relforcerowsecurity
FROM   pg_class
WHERE  relname = 'admin_audit_log';

-- B) List all active policies on the table
-- Expected rows: audit_log_select_own (SELECT, authenticated, PERMISSIVE)
--                audit_log_deny_insert_authenticated (INSERT, authenticated, RESTRICTIVE)
SELECT polname, cmd, roles, qual, with_check, polpermissive
FROM   pg_policies
WHERE  tablename = 'admin_audit_log';

-- C) Check role-level privileges (should show NO INSERT for anon/authenticated)
-- Expected: service_role has INSERT; anon + authenticated do NOT.
SELECT grantee, privilege_type, is_grantable
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public'
  AND  table_name   = 'admin_audit_log'
ORDER  BY grantee, privilege_type;
