-- Las placas guardadas ("Tus placas", en el modal de exportar) viajan por la
-- misma tabla que los presets editoriales y de gradiente. Solo hay que abrir
-- el CHECK del tipo para que las acepte.
--
-- Mientras esta migracion no corra, el cliente guarda las placas en el
-- dispositivo y la biblioteca lo dice: el rechazo de la nube no rompe nada ni
-- arrastra a los otros presets.

ALTER TABLE public.user_export_presets
    DROP CONSTRAINT IF EXISTS user_export_presets_preset_type_check;

ALTER TABLE public.user_export_presets
    ADD CONSTRAINT user_export_presets_preset_type_check
    CHECK (preset_type IN ('editorial', 'gradient', 'design_customization', 'plate'));
