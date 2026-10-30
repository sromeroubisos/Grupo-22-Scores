-- ROLLBACK de 20260819210000_blindar_users_role.sql
--
-- Deja users.role otra vez escribible desde el cliente. Volves a quedar
-- expuesto a la escalada a super_admin con la anon key: correlo solo si el
-- trigger esta rompiendo una escritura legitima, y arregla esa escritura para
-- que pase por service key antes de dejarlo revertido.

BEGIN;

DROP TRIGGER IF EXISTS guard_users_role_change ON public.users;
DROP FUNCTION IF EXISTS public.guard_users_role_change();

NOTIFY pgrst, 'reload schema';

COMMIT;
