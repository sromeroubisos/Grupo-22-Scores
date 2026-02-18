-- 1. Registra un usuario nuevo en la aplicación (ej: admin@g22scores.com)
-- 2. Ejecuta esta consulta en el Editor SQL de Supabase para darle rol de Super Admin:

UPDATE public.users 
SET role = 'super_admin' 
WHERE email = 'admin@g22scores.com';

-- Verificar el cambio:
SELECT * FROM public.users WHERE role = 'super_admin';
