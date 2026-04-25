-- Make user export preset writes idempotent, including older clients that still
-- insert local ids such as "preset-1" or "gradient-1".

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_user_export_preset_insert_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id TEXT;
BEGIN
    SELECT id
    INTO v_existing_id
    FROM public.user_export_presets
    WHERE user_id = NEW.user_id
      AND preset_type = NEW.preset_type
      AND name_normalized = NEW.name_normalized
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.user_export_presets
        SET
            name = NEW.name,
            payload = NEW.payload,
            updated_at = now()
        WHERE id = v_existing_id;

        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_export_presets
        WHERE id = NEW.id
    ) THEN
        NEW.id := 'export_preset:' || NEW.user_id::text || ':' || NEW.preset_type || ':' || encode(convert_to(NEW.name_normalized, 'UTF8'), 'hex');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_export_presets_insert_conflict_guard ON public.user_export_presets;
CREATE TRIGGER user_export_presets_insert_conflict_guard
    BEFORE INSERT ON public.user_export_presets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_export_preset_insert_conflict();

COMMIT;
