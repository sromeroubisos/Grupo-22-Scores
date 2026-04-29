BEGIN;

-- =========================================================
-- Custom chart configs scoped por club para los paneles de
-- estadísticas de partido (postpartido) y de temporada.
-- Cada admin del club ve y edita los mismos charts.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.club_chart_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    panel_key TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    chart_type TEXT NOT NULL,
    title TEXT,
    stat_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_chart_configs_club_panel_pos
    ON public.club_chart_configs (club_id, panel_key, position);

CREATE INDEX IF NOT EXISTS idx_club_chart_configs_stat_keys_gin
    ON public.club_chart_configs USING GIN (stat_keys);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'club_chart_configs_panel_key_check'
          AND conrelid = 'public.club_chart_configs'::regclass
    ) THEN
        ALTER TABLE public.club_chart_configs
            ADD CONSTRAINT club_chart_configs_panel_key_check
            CHECK (panel_key IN ('postmatch', 'season-stats'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'club_chart_configs_chart_type_check'
          AND conrelid = 'public.club_chart_configs'::regclass
    ) THEN
        ALTER TABLE public.club_chart_configs
            ADD CONSTRAINT club_chart_configs_chart_type_check
            CHECK (chart_type IN ('comparison', 'grouped-bars', 'radar', 'donut'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'club_chart_configs_stat_keys_is_array_chk'
          AND conrelid = 'public.club_chart_configs'::regclass
    ) THEN
        ALTER TABLE public.club_chart_configs
            ADD CONSTRAINT club_chart_configs_stat_keys_is_array_chk
            CHECK (jsonb_typeof(stat_keys) = 'array');
    END IF;
END $$;

ALTER TABLE public.club_chart_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_chart_configs_select_members" ON public.club_chart_configs;
CREATE POLICY "club_chart_configs_select_members"
ON public.club_chart_configs
FOR SELECT
TO authenticated
USING (
    public.has_membership_scope('club', club_id)
    OR public.is_global_admin()
);

DROP POLICY IF EXISTS "club_chart_configs_insert_members" ON public.club_chart_configs;
CREATE POLICY "club_chart_configs_insert_members"
ON public.club_chart_configs
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_membership_scope('club', club_id)
    OR public.is_global_admin()
);

DROP POLICY IF EXISTS "club_chart_configs_update_members" ON public.club_chart_configs;
CREATE POLICY "club_chart_configs_update_members"
ON public.club_chart_configs
FOR UPDATE
TO authenticated
USING (
    public.has_membership_scope('club', club_id)
    OR public.is_global_admin()
)
WITH CHECK (
    public.has_membership_scope('club', club_id)
    OR public.is_global_admin()
);

DROP POLICY IF EXISTS "club_chart_configs_delete_members" ON public.club_chart_configs;
CREATE POLICY "club_chart_configs_delete_members"
ON public.club_chart_configs
FOR DELETE
TO authenticated
USING (
    public.has_membership_scope('club', club_id)
    OR public.is_global_admin()
);

COMMENT ON TABLE public.club_chart_configs IS
    'Configuraciones de graficos personalizados por club para los paneles de estadisticas (postpartido, season-stats). Visibles a todos los admins del club.';

NOTIFY pgrst, 'reload schema';

COMMIT;
