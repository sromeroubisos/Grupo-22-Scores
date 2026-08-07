-- Rollback del recálculo de subcategory de los torneos de URBA.
-- Devuelve cada fila al valor exacto que tenía, una por una.
BEGIN;
UPDATE public.tournaments SET subcategory = 'Superior' WHERE external_id = 'urba:2025167';
UPDATE public.tournaments SET subcategory = 'Superior' WHERE external_id = 'urba:2025163';
UPDATE public.tournaments SET subcategory = 'Superior' WHERE external_id = 'urba:2025164';
UPDATE public.tournaments SET subcategory = 'Superior' WHERE external_id = 'urba:2025165';
UPDATE public.tournaments SET subcategory = 'Superior' WHERE external_id = 'urba:2025166';
COMMIT;
