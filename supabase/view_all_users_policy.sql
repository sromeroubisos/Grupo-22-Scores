-- Create the policy: Check if the user is a super admin
-- If a user is a super admin, they can SELECT ALL rows from public.users

DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;

CREATE POLICY "Super admins can view all profiles"
ON public.users
FOR SELECT
USING (
  -- Check if the current user has the 'super_admin' role
  EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = auth.uid() AND u.role = 'super_admin'
  )
);
