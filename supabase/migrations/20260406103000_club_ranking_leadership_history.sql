-- Leadership history for club rankings.

CREATE TABLE IF NOT EXISTS public.club_ranking_leadership_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ranking_id text NOT NULL REFERENCES public.club_rankings(id) ON DELETE CASCADE,
    club_id text NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL,
    ended_at timestamptz NULL,
    days_as_leader integer NOT NULL DEFAULT 0,
    started_reason text NOT NULL DEFAULT 'initial'
        CHECK (started_reason IN ('initial', 'match', 'manual')),
    ended_reason text NULL
        CHECK (ended_reason IS NULL OR ended_reason IN ('match', 'manual')),
    started_match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    ended_match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    started_adjustment_id uuid NULL REFERENCES public.club_ranking_manual_adjustments(id) ON DELETE SET NULL,
    ended_adjustment_id uuid NULL REFERENCES public.club_ranking_manual_adjustments(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_ranking_leadership_periods_ranking_started_idx
    ON public.club_ranking_leadership_periods (ranking_id, started_at DESC);

CREATE INDEX IF NOT EXISTS club_ranking_leadership_periods_ranking_club_idx
    ON public.club_ranking_leadership_periods (ranking_id, club_id, started_at DESC);

ALTER TABLE public.club_ranking_leadership_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_club_ranking_leadership_periods" ON public.club_ranking_leadership_periods;
CREATE POLICY "admin_manage_club_ranking_leadership_periods"
    ON public.club_ranking_leadership_periods
    FOR ALL
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());
