-- The previous conflict guard updated rows from a BEFORE INSERT trigger while
-- PostgREST was already executing INSERT ... ON CONFLICT DO UPDATE. Concurrent
-- preset sync batches could then lock the same rows in different orders and
-- raise 40P01 deadlocks.

BEGIN;

DROP TRIGGER IF EXISTS user_export_presets_insert_conflict_guard ON public.user_export_presets;
DROP FUNCTION IF EXISTS public.handle_user_export_preset_insert_conflict();

COMMIT;
