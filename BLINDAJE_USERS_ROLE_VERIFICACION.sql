-- Verificacion de 20260819210000_blindar_users_role.sql
-- Correlo en el SQL editor de Supabase DESPUES de aplicar la migracion.

-- 1. El trigger existe y esta habilitado ('O' = enabled, origin)
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.users'::regclass
  AND NOT tgisinternal;

-- 2. Simulacion del ataque: un usuario autenticado intentando escalar.
--    Tiene que fallar con SQLSTATE 42501.
DO $$
DECLARE
    victima uuid;
BEGIN
    SELECT id INTO victima FROM public.users LIMIT 1;

    SET LOCAL ROLE authenticated;
    BEGIN
        UPDATE public.users SET role = 'super_admin' WHERE id = victima;
        RESET ROLE;
        RAISE EXCEPTION 'FALLO: el UPDATE de role paso con rol authenticated';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
        RAISE NOTICE 'OK: el trigger bloqueo la escalada (42501)';
    END;
END $$;

-- 3. Un UPDATE que NO toca role sigue funcionando para el usuario.
--    Tiene que decir OK.
DO $$
DECLARE
    victima uuid;
    nombre_previo text;
BEGIN
    SELECT id, name INTO victima, nombre_previo FROM public.users LIMIT 1;

    UPDATE public.users SET name = nombre_previo WHERE id = victima;
    RAISE NOTICE 'OK: un UPDATE sin cambio de role sigue pasando';
END $$;

-- 4. Censo de cuentas con rol elevado. Revisalas a mano: si aparece alguna
--    que no reconoces, la escalada ya fue explotada.
SELECT id, email, role, created_at, last_login_at
FROM public.users
WHERE role NOT IN ('fan', 'user')
ORDER BY created_at;
