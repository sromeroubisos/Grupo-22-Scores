-- 1. Force RLS to allow users to read their own data
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
CREATE POLICY "Users can view their own data" 
ON public.users FOR SELECT 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
CREATE POLICY "Users can update their own data" 
ON public.users FOR UPDATE 
USING (auth.uid() = id);

-- 2. Force the role update again to be absolutely sure
UPDATE public.users 
SET role = 'super_admin' 
WHERE email = 'deportesgrupo@gmail.com';

-- 3. Verify the result
SELECT id, email, role FROM public.users WHERE email = 'deportesgrupo@gmail.com';
