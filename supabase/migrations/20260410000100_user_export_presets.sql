-- ============================================================
-- User Export Presets
-- Created: 2026-04-10
-- Purpose: Sync saved export and gradient presets across devices
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_export_presets (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    preset_type TEXT NOT NULL CHECK (preset_type IN ('editorial', 'gradient')),
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, preset_type, name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_user_export_presets_user_id
    ON public.user_export_presets(user_id);

CREATE INDEX IF NOT EXISTS idx_user_export_presets_type
    ON public.user_export_presets(user_id, preset_type);

ALTER TABLE public.user_export_presets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users manage own export presets" ON public.user_export_presets;
END $$;

CREATE POLICY "Users manage own export presets"
    ON public.user_export_presets
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
