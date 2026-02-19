-- 1. Create a Secure Function to check admin status
-- This function runs with the privileges of the creator (postgres/superuser), so it BYPASSES RLS.
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

-- 2. Drop the recursive policies
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.users;

-- 3. Create non-recursive policies using the function
CREATE POLICY "Super admins can view all profiles"
ON public.users
FOR SELECT
USING ( public.authorize_admin() );

CREATE POLICY "Super admins can update all profiles"
ON public.users
FOR UPDATE
USING ( public.authorize_admin() );
