-- ============================================================
-- 🚀 ULTIMATE RLS RECURSION FIX (Safe Strategy)
-- ============================================================
-- 📍 PARA EJECUTAR EN EL SQL EDITOR DE SUPABASE:
-- https://supabase.com/dashboard/project/vxsolicapdcpemfsahbk/sql/new

BEGIN;

-- 1. LIMpieza PREVIA DE POLÍTICAS CONFLICTIVAS (Limpiamos TODO antes de re-crear)
DROP POLICY IF EXISTS "Admin Tournament Management" ON public.tournaments;
DROP POLICY IF EXISTS "Admin Tournament Insert" ON public.tournaments;
DROP POLICY IF EXISTS "Admin Tournament Update" ON public.tournaments;
DROP POLICY IF EXISTS "Admin Tournament Delete" ON public.tournaments;
DROP POLICY IF EXISTS "super_admin_manage_sports" ON public.sports;
DROP POLICY IF EXISTS "super_admin_insert_sports" ON public.sports;
DROP POLICY IF EXISTS "super_admin_update_sports" ON public.sports;
DROP POLICY IF EXISTS "super_admin_delete_sports" ON public.sports;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_admin_all" ON public.users;
DROP POLICY IF EXISTS "users_superadmin_all" ON public.users;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.users;

-- 2. FUNCIÓN DE SEGURIDAD ROBUSTA (SECURITY DEFINER + BYPASS RLS)
-- Rompe el bucle de recursión usando metadatos del JWT primero.
CREATE OR REPLACE FUNCTION public.get_app_role_safe(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_role TEXT;
    v_email TEXT;
BEGIN
    IF p_user_id IS NULL THEN RETURN 'fan'; END IF;

    -- Ruta A: JWT Metadata (Súper rápido, sin hits a la DB, sin recursión)
    v_role := (auth.jwt() -> 'app_metadata' ->> 'role');
    IF v_role IS NOT NULL THEN RETURN v_role; END IF;

    -- Ruta B: Superadmins harcoded (Para emergencias o primer login)
    -- Esto usa auth.users que no tiene RLS, por lo que no causa recursión circular.
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email IN ('superadmin@g22scores.com', 'deportesgrupo@gmail.com', 'sromeroubisos@gmail.com') THEN
        RETURN 'super_admin';
    END IF;

    -- Ruta C: Consulta a la DB (SECURITY DEFINER permite saltarse el RLS aquí)
    -- El hecho de ser SECURITY DEFINER y estar en search_path público permite bypass.
    SELECT role INTO v_role FROM public.users WHERE id = p_user_id;
    
    RETURN COALESCE(v_role, 'fan');
END;
$$;

-- 3. HELPER SEGURO PARA CHEQUEO DE ADMIN
CREATE OR REPLACE FUNCTION public.is_admin_safe()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT public.get_app_role_safe(auth.uid()) IN ('super_admin', 'admin_general', 'admin', 'operator');
$$;

-- 4. RE-HABILITAR RLS CON POLÍTICAS LIMPIAS EN USERS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- CRÍTICO: La política de SELECT en public.users NO debe llamar a is_admin() para evitar recursión circular.
-- El usuario solo puede verse a sí mismo en SELECT inicial.
CREATE POLICY "users_select_own" ON public.users
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- Los admins tienen acceso total mediante una política separada.
CREATE POLICY "users_admin_all" ON public.users
    FOR ALL TO authenticated
    USING (public.is_admin_safe());

-- 5. POLÍTICAS PARA DEPORTES Y TORNEOS (Mucho más simples y eficientes)
CREATE POLICY "public_read_sports" ON public.sports FOR SELECT USING (true);
CREATE POLICY "admin_manage_sports" ON public.sports FOR ALL TO authenticated 
    USING (public.is_admin_safe());

CREATE POLICY "public_read_tournaments" ON public.tournaments FOR SELECT 
    USING (is_active = true OR is_active IS NULL);

CREATE POLICY "admin_manage_tournaments" ON public.tournaments FOR ALL TO authenticated 
    USING (public.is_admin_safe());

-- 6. Recargar caché de PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
