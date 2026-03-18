-- ============================================================
-- FINAL RLS RECURSION FIX (ULTIMATE SOLUTION)
-- ============================================================

-- 1. DROP ALL POTENTIAL CONFLICTS FIRST
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

-- 2. CREATE A TRULY SAFE ROLE FUNCTION (SECURITY DEFINER + BYPASS RLS)
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

    -- Path A: Hardcoded Superadmins (High performance, No DB hits)
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email IN ('superadmin@g22scores.com', 'deportesgrupo@gmail.com', 'sromeroubisos@gmail.com') THEN
        RETURN 'super_admin';
    END IF;

    -- Path B: Database Role (SECURITY DEFINER bypasses RLS on public.users)
    SELECT role INTO v_role FROM public.users WHERE id = p_user_id;
    
    RETURN COALESCE(v_role, 'fan');
END;
$$;

-- 3. REDEFINE is_admin TO USE THE SAFE VERSION
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT public.get_app_role_safe(auth.uid()) IN ('super_admin', 'admin_general', 'admin', 'operator');
$$;

-- 4. RE-ENABLE RLS WITH CLEAN POLICIES
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: The SELECT policy on users is the one that causes recursion if not careful.
-- We use a policy that doesn't call is_admin() for SELECT if we want to be absolute.
-- But using the safe version is usually okay.
CREATE POLICY "users_select_own" ON public.users
    FOR SELECT TO authenticated
    USING (auth.uid() = id OR public.is_admin());

-- For other operations, admins can do anything
CREATE POLICY "users_admin_all" ON public.users
    FOR ALL TO authenticated
    USING (public.is_admin());

-- 5. Sports and Tournaments Policies
CREATE POLICY "public_read_sports" ON public.sports FOR SELECT USING (true);
CREATE POLICY "admin_manage_sports" ON public.sports FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "public_read_tournaments" ON public.tournaments FOR SELECT USING (is_active = true);
CREATE POLICY "admin_manage_tournaments" ON public.tournaments FOR ALL TO authenticated USING (public.is_admin());

-- 6. Reload Everything
NOTIFY pgrst, 'reload schema';
