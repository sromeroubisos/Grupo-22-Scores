-- =============================================================================
-- MISSING TABLES: ui_labels + team_labels
-- Run in Supabase SQL Editor to enable tournament phase label management.
-- =============================================================================

-- 1. ui_labels — stores reusable color labels for standings/groups
CREATE TABLE IF NOT EXISTS public.ui_labels (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '#00a365',
    scope       TEXT        NOT NULL DEFAULT 'standings',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ui_labels ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_labels TO authenticated;

DROP POLICY IF EXISTS "ui_labels_authenticated_all" ON public.ui_labels;
CREATE POLICY "ui_labels_authenticated_all" ON public.ui_labels
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. team_labels — assigns labels to participants per tournament/phase/group
CREATE TABLE IF NOT EXISTS public.team_labels (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID    REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id         TEXT    REFERENCES public.clubs(id) ON DELETE CASCADE,
    label_id        UUID    REFERENCES public.ui_labels(id) ON DELETE CASCADE,
    phase_id        UUID    REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    group_id        UUID    REFERENCES public.tournament_groups(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_labels ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_labels TO authenticated;

DROP POLICY IF EXISTS "team_labels_authenticated_all" ON public.team_labels;
CREATE POLICY "team_labels_authenticated_all" ON public.team_labels
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
