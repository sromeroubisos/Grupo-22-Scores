-- Allow persistent design customization rows alongside editorial/gradient presets.

ALTER TABLE public.user_export_presets
    DROP CONSTRAINT IF EXISTS user_export_presets_preset_type_check;

ALTER TABLE public.user_export_presets
    ADD CONSTRAINT user_export_presets_preset_type_check
    CHECK (preset_type IN ('editorial', 'gradient', 'design_customization'));
