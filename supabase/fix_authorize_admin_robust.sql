-- =============================================================================
-- FIX: authorize_admin() robusta — cubre TODOS los paths posibles del JWT
-- Ejecutar DESPUÉS de fix_admin_audit_log.sql
-- Idempotente: usa CREATE OR REPLACE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- PATH 1 (este proyecto): rol en public.users.role
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin_general', 'admin')
    )
    OR
    -- PATH 2: rol en app_metadata.role (JWT claim)
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin_general', 'admin')
    OR
    -- PATH 3: rol en app_metadata.roles[] (array claim)
    (auth.jwt() -> 'app_metadata' -> 'roles') ? 'super_admin'
    OR
    (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin_general'
    OR
    -- PATH 4: rol en user_metadata.role
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'admin_general', 'admin')
    OR
    -- PATH 5: rol en el JWT directamente (Supabase custom claims via hook)
    (auth.jwt() ->> 'role') IN ('super_admin', 'admin_general', 'admin');
$$;

-- Verificar que la función fue creada correctamente
SELECT
    proname AS function_name,
    prosrc  AS function_body
FROM pg_proc
JOIN pg_namespace ns ON ns.oid = pronamespace
WHERE ns.nspname = 'public'
  AND proname = 'authorize_admin';
