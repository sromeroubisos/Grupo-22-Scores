BEGIN;

CREATE INDEX IF NOT EXISTS idx_user_export_presets_user_type_updated_at
    ON public.user_export_presets (user_id, preset_type, updated_at DESC);

COMMIT;
