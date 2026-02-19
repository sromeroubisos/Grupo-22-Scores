-- 1. Apply the Policy allowing Super Admins to view ALL users
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;

CREATE POLICY "Super admins can view all profiles"
ON public.users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin_general')
  )
);

-- 2. Fix the missing name for your user (optional, for better display)
UPDATE public.users
SET name = 'Deportes Grupo'
WHERE email = 'deportesgrupo@gmail.com' AND name IS NULL;
