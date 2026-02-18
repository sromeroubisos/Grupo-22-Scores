-- ============================================================
-- FIX: RLS en public.users
--
-- PROBLEMA ORIGINAL:
--   CREATE POLICY "Super Admin Full Access Users" ON public.users USING (
--       (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
--   );
--
--   Esta policy es RECURSIVA: para evaluar si el usuario puede
--   leer la tabla, consulta la misma tabla → PostgreSQL devuelve
--   vacío → profile = null → todos quedan como 'fan', incluso admins.
-- ============================================================

-- 1. Función helper SECURITY DEFINER (bypasea RLS, no genera recursión)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = (select auth.uid()) AND role = 'super_admin'
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;

-- 2. Borrar todas las policies actuales de users para partir limpio
DROP POLICY IF EXISTS "Super Admin Full Access Users"  ON public.users;
DROP POLICY IF EXISTS "super_admin_full_access"        ON public.users;
DROP POLICY IF EXISTS "Users can read own profile"     ON public.users;
DROP POLICY IF EXISTS "Users can update own profile"   ON public.users;
DROP POLICY IF EXISTS "Auth Users Can Create"          ON public.users;

-- 3. SELECT: cada usuario puede leer su propia fila
--    Los super_admins pueden leer todas las filas
CREATE POLICY "users_select_own" ON public.users
    FOR SELECT
    USING (
        (select auth.uid()) = id          -- propio perfil
        OR public.is_super_admin()        -- o es admin
    );

-- 4. UPDATE: cada usuario puede modificar solo su propia fila
CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE
    USING ((select auth.uid()) = id)
    WITH CHECK ((select auth.uid()) = id);

-- 5. INSERT: solo service_role puede crear usuarios
--    (el trigger on_auth_user_created usa SECURITY DEFINER, no necesita policy)

-- 6. Super admin puede hacer todo
CREATE POLICY "users_superadmin_all" ON public.users
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

NOTIFY pgrst, 'reload config';
