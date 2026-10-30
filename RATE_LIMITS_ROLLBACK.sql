-- ROLLBACK de 20260819220000_rate_limits.sql
--
-- Volves al contador en memoria de cada instancia, o sea a un limite que en
-- Vercel se multiplica por la cantidad de lambdas. El codigo falla abierto si
-- la funcion no existe, asi que esto no rompe ningun endpoint: los deja sin
-- limite compartido.

BEGIN;

DROP FUNCTION IF EXISTS public.consume_rate_limit(text, integer, integer);
DROP TABLE IF EXISTS public.rate_limits;

NOTIFY pgrst, 'reload schema';

COMMIT;
