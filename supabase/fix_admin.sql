-- Run this in the Supabase SQL Editor to force the role update
-- This updates the public.users table which the application uses for permissions

UPDATE public.users 
SET role = 'super_admin' 
WHERE email = 'deportesgrupo@gmail.com';

-- Verify the change
SELECT * FROM public.users WHERE email = 'deportesgrupo@gmail.com';
