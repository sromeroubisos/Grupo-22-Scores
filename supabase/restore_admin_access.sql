-- 1. Asegurar que el usuario específico sea Super Admin
UPDATE public.users
SET role = 'super_admin'
WHERE email = 'deportesgrupo@gmail.com';

-- 2. Asegurar que existe la función de seguridad (bypass RLS)
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin_general')
  );
$$;

-- 3. Limpiar políticas antiguas conflictivas
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Ver perfil propio" ON public.users;


-- 4. Crear política básica: Todo usuario puede ver su propio perfil
-- (Esto es CRUCIAL para que el login funcione y no devuelva null)
CREATE POLICY "Users can view own profile"
ON public.users
FOR SELECT
USING ( auth.uid() = id );

-- 5. Crear políticas de Super Admin (usando la función segura)
CREATE POLICY "Super admins can view all profiles"
ON public.users
FOR SELECT
USING ( public.authorize_admin() );

CREATE POLICY "Super admins can update all profiles"
ON public.users
FOR UPDATE
USING ( public.authorize_admin() );

-- 6. Verificar que RLS esté activo
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
