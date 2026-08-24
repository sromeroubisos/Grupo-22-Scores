-- Blindaje de public.users.role
--
-- CAUSA: la policy viva `users_update_access`
-- (20260411110000_fix_rls_policy_performance.sql) habilita UPDATE de la fila
-- propia SIN restringir columnas:
--
--     USING ((select auth.uid()) = id OR public.is_admin())
--     WITH CHECK ((select auth.uid()) = id OR public.is_admin())
--
-- Con eso, cualquier usuario autenticado escala a super_admin desde la consola
-- del navegador con la anon key publica:
--
--     await supabase.from('users').update({ role: 'super_admin' }).eq('id', miId)
--
-- Y el permiso se auto-otorga, porque is_super_admin() / is_admin() resuelven
-- leyendo esa misma columna.
--
-- FIX: un trigger BEFORE UPDATE que rechaza todo cambio de `role` cuando el rol
-- de base de la conexion es `authenticated` o `anon` — es decir, cuando la
-- escritura viene de PostgREST con un token de usuario. `service_role`,
-- `postgres` y `supabase_admin` pasan sin restriccion.
--
-- Por que trigger y no privilegios por columna: un
-- `REVOKE UPDATE ... GRANT UPDATE (col1, col2, ...)` obliga a re-otorgar cada
-- columna nueva de `users`, y una columna olvidada falla en runtime con un
-- "permission denied" dificil de rastrear. El trigger nombra lo unico que hay
-- que proteger y sobrevive a cualquier ALTER TABLE.
--
-- La funcion es SECURITY INVOKER a proposito: necesita ver el `current_user`
-- real del que llama. Con SECURITY DEFINER pasaria a ser el dueno y el guard
-- no distinguiria nada.
--
-- Ningun camino legitimo se rompe: los cambios de rol de la app van todos por
-- rutas API con service key detras de requireGlobalAdminContext
-- (api/admin/users/[id]/access, api/admin/super/personas-roles/*), y
-- syncUserProfile usa createAdminClient().

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_users_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND current_user IN ('authenticated', 'anon') THEN
        RAISE EXCEPTION
            'users.role no se puede modificar desde el cliente (rol de base: %). Usa una ruta admin con service key.',
            current_user
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_users_role_change() IS
    'Impide la escalada de privilegios via UPDATE de users.role con la anon key. Ver 20260819210000_blindar_users_role.sql.';

DROP TRIGGER IF EXISTS guard_users_role_change ON public.users;

CREATE TRIGGER guard_users_role_change
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_users_role_change();

NOTIFY pgrst, 'reload schema';

COMMIT;
