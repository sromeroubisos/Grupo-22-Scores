-- Create a secure function to check for admin privileges
-- Security Definer allows this function to bypass RLS when checking the role
CREATE OR REPLACE FUNCTION public.check_is_super_admin()
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

-- Update RLS policies for public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own data
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
-- We combine self-access and admin-access into policies or keeping them separate
-- It is cleaner to have one broad select policy or separate overlapping ones. 
-- Supabase allows multiple policies (OR logic).

CREATE POLICY "Users can view their own data"
ON public.users FOR SELECT
USING (auth.uid() = id);

-- Policy: Super Admins can view all data
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;
CREATE POLICY "Super admins can view all profiles"
ON public.users FOR SELECT
USING (check_is_super_admin());

-- Policy: Super Admins can update all data
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.users;
CREATE POLICY "Super admins can update all profiles"
ON public.users FOR UPDATE
USING (check_is_super_admin());

-- Verify
SELECT count(*) as admin_count FROM public.users WHERE role = 'super_admin';
