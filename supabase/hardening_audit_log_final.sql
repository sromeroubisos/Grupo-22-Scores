-- =============================================================================
-- HARDENING FINAL: admin_audit_log INSERT policy
-- Los inserts ahora llegan via service_role (createAdminClient en server actions)
-- → revocar INSERT a authenticated, solo service_role puede insertar
-- → SELECT sigue siendo authorize_admin() para lecturas desde la app
-- =============================================================================

-- Revocar INSERT de authenticated (ya no lo necesita — lo hace service_role)
REVOKE INSERT ON public.admin_audit_log FROM authenticated;

-- Eliminar policy de INSERT permisiva (ya no aplica)
DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;

-- service_role bypasa RLS automáticamente — no necesita policy explícita.
-- Solo necesitamos asegurar que service_role tiene permisos a nivel grant:
GRANT INSERT ON public.admin_audit_log TO service_role;

-- SELECT sigue igual: solo admins pueden leer los logs desde la app
-- (ya existente, pero re-creamos por claridad)
DROP POLICY IF EXISTS "Allow select for super_admins" ON public.admin_audit_log;
CREATE POLICY "Allow select for super_admins"
    ON public.admin_audit_log FOR SELECT TO authenticated
    USING (public.authorize_admin());

-- Verificar estado final de grants y policies
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'admin_audit_log'
  AND table_schema = 'public'
ORDER BY grantee, privilege_type;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'admin_audit_log';
