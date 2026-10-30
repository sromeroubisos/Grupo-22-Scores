-- Arreglo: sromeroubisos@gmail.com pasa a super_admin.
-- Va junto con el cambio de código en src/lib/types/user.ts
-- (SUPER_ADMIN_ROLE_EMAILS): el código resuelve el rol por mail y gana sobre
-- esta tabla, pero la RLS de news lee users.role. Las dos mitades tienen que
-- coincidir. Con el código deployado, syncUserProfile haría este UPDATE solo
-- en el próximo login; correrlo a mano evita esperar al deploy.
--
-- Corre en el SQL Editor (como postgres): el trigger guard_users_role_change
-- solo bloquea a authenticated/anon. Idempotente.

UPDATE public.users
SET role = 'super_admin'
WHERE lower(email) = 'sromeroubisos@gmail.com'
  AND role IS DISTINCT FROM 'super_admin';

-- Verificación: las dos cuentas tienen que decir super_admin.
SELECT email, role
FROM public.users
WHERE lower(email) IN ('superadmin@g22scores.com', 'sromeroubisos@gmail.com');

-- ROLLBACK (y volver el mail a AUTHORIZED_ADMIN_GENERAL_EMAILS en user.ts):
-- UPDATE public.users SET role = 'admin_general' WHERE lower(email) = 'sromeroubisos@gmail.com';
