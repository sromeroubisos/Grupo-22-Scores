-- Club rankings using a World Rugby style exchange system.

CREATE TABLE IF NOT EXISTS public.club_rankings (
    id text PRIMARY KEY,
    name text NOT NULL,
    sport text NOT NULL DEFAULT 'rugby',
    season text NOT NULL,
    results_season integer NOT NULL,
    scope text NOT NULL DEFAULT 'clubes-designados',
    description text NULL,
    algorithm text NOT NULL DEFAULT 'world_rugby',
    home_advantage numeric(10,4) NOT NULL DEFAULT 3,
    margin_threshold integer NOT NULL DEFAULT 15,
    margin_multiplier numeric(10,4) NOT NULL DEFAULT 1.5,
    event_multiplier numeric(10,4) NOT NULL DEFAULT 1,
    initial_imported_at timestamptz NULL,
    backfill_completed_at timestamptz NULL,
    stale_from_match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    stale_from_match_date timestamptz NULL,
    stale_reason text NULL,
    last_incremental_match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_ranking_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ranking_id text NOT NULL REFERENCES public.club_rankings(id) ON DELETE CASCADE,
    club_id text NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    source_row_index integer NULL,
    source_name text NOT NULL,
    source_region text NULL,
    source_position integer NULL,
    source_previous_position integer NULL,
    source_variation numeric(10,4) NULL,
    source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    initial_rating numeric(10,4) NOT NULL,
    current_rating numeric(10,4) NOT NULL,
    current_position integer NULL,
    is_active boolean NOT NULL DEFAULT true,
    last_applied_match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT club_ranking_entries_unique UNIQUE (ranking_id, club_id)
);

CREATE TABLE IF NOT EXISTS public.club_ranking_match_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ranking_id text NOT NULL REFERENCES public.club_rankings(id) ON DELETE CASCADE,
    match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    match_date_time timestamptz NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    applied_mode text NOT NULL DEFAULT 'incremental'
        CHECK (applied_mode IN ('incremental', 'backfill', 'rebuild')),
    home_club_id text NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    away_club_id text NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    home_rating_before numeric(10,4) NOT NULL,
    away_rating_before numeric(10,4) NOT NULL,
    home_delta numeric(10,4) NOT NULL,
    away_delta numeric(10,4) NOT NULL,
    home_rating_after numeric(10,4) NOT NULL,
    away_rating_after numeric(10,4) NOT NULL,
    home_score integer NOT NULL,
    away_score integer NOT NULL,
    margin integer NOT NULL,
    result text NOT NULL CHECK (result IN ('home_win', 'away_win', 'draw')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT club_ranking_match_applications_unique UNIQUE (ranking_id, match_id)
);

CREATE TABLE IF NOT EXISTS public.club_ranking_manual_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ranking_id text NOT NULL REFERENCES public.club_rankings(id) ON DELETE CASCADE,
    club_id text NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    mode text NOT NULL CHECK (mode IN ('delta', 'set')),
    value numeric(10,4) NOT NULL,
    reason text NOT NULL,
    resulting_rating numeric(10,4) NULL,
    created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS club_rankings_sport_results_season_idx
    ON public.club_rankings (sport, results_season, created_at DESC);

CREATE INDEX IF NOT EXISTS club_ranking_entries_ranking_position_idx
    ON public.club_ranking_entries (ranking_id, current_position, current_rating DESC);

CREATE INDEX IF NOT EXISTS club_ranking_entries_ranking_club_idx
    ON public.club_ranking_entries (ranking_id, club_id);

CREATE INDEX IF NOT EXISTS club_ranking_match_applications_ranking_date_idx
    ON public.club_ranking_match_applications (ranking_id, match_date_time, applied_at);

CREATE INDEX IF NOT EXISTS club_ranking_manual_adjustments_ranking_created_idx
    ON public.club_ranking_manual_adjustments (ranking_id, created_at DESC);

ALTER TABLE public.club_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_ranking_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_ranking_match_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_ranking_manual_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_club_rankings" ON public.club_rankings;
CREATE POLICY "admin_manage_club_rankings"
    ON public.club_rankings
    FOR ALL
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

DROP POLICY IF EXISTS "admin_manage_club_ranking_entries" ON public.club_ranking_entries;
CREATE POLICY "admin_manage_club_ranking_entries"
    ON public.club_ranking_entries
    FOR ALL
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

DROP POLICY IF EXISTS "admin_manage_club_ranking_match_applications" ON public.club_ranking_match_applications;
CREATE POLICY "admin_manage_club_ranking_match_applications"
    ON public.club_ranking_match_applications
    FOR ALL
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

DROP POLICY IF EXISTS "admin_manage_club_ranking_manual_adjustments" ON public.club_ranking_manual_adjustments;
CREATE POLICY "admin_manage_club_ranking_manual_adjustments"
    ON public.club_ranking_manual_adjustments
    FOR ALL
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

DROP TRIGGER IF EXISTS update_club_rankings_updated_at ON public.club_rankings;
CREATE TRIGGER update_club_rankings_updated_at
    BEFORE UPDATE ON public.club_rankings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_club_ranking_entries_updated_at ON public.club_ranking_entries;
CREATE TRIGGER update_club_ranking_entries_updated_at
    BEFORE UPDATE ON public.club_ranking_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
