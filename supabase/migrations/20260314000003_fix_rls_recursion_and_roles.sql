-- ============================================================
-- FIX: Role Detection & RLS Recursion (Final Solution)
-- ============================================================

-- 1. Robust role check function (Bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_app_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_role TEXT;
    v_email TEXT;
BEGIN
    -- Get role from DB
    SELECT role INTO v_role FROM public.users WHERE id = p_user_id;

    -- If not found or fan, check if the email belongs to the hardcoded superadmin list
    -- This provides a "break glass" access for initial setup or sync issues
    IF v_role IS NULL OR v_role = 'fan' THEN
        SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
        IF v_email IN ('superadmin@g22scores.com', 'deportesgrupo@gmail.com', 'sromeroubisos@gmail.com') THEN
            RETURN 'super_admin';
        END IF;
    END IF;

    RETURN COALESCE(v_role, 'fan');
END;
$$;

-- 2. Helper to check for any administrative role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT public.get_app_role(auth.uid()) IN ('super_admin', 'admin_general', 'admin', 'operator');
$$;

-- RPC for the frontend to get the role reliably
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT public.get_app_role(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- 3. Update public.users policies to use the new functions (Breaking the recursion)
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
    FOR SELECT
    USING (
        auth.uid() = id                       -- User can always see their own record
        OR public.is_admin()                  -- Admins can see all records
    );

DROP POLICY IF EXISTS "users_superadmin_all" ON public.users;
CREATE POLICY "users_superadmin_all" ON public.users
    FOR ALL
    USING (public.get_app_role(auth.uid()) = 'super_admin');

-- 4. Update tournaments policies to use non-recursive checks
DROP POLICY IF EXISTS "Admin Tournament Management" ON public.tournaments;
CREATE POLICY "Admin Tournament Management" ON public.tournaments
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 5. Fix roles constraint in users table to allow all roles defined in code
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('fan', 'user', 'super_admin', 'operator', 'club_admin', 'admin_general', 'admin'));

-- Notify schema cache refresh
NOTIFY pgrst, 'reload schema';
