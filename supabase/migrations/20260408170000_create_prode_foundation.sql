CREATE TABLE IF NOT EXISTS public.prode_rulesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    scoring_model JSONB NOT NULL DEFAULT '{}'::jsonb,
    outcome_scope TEXT NOT NULL DEFAULT 'regulation'
        CHECK (outcome_scope IN ('regulation', 'extra_time', 'penalties', 'qualified')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prode_competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'active', 'finished', 'archived')),
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'private', 'unlisted')),
    source_type TEXT NOT NULL
        CHECK (source_type IN ('local', 'external', 'mixed')),
    local_tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    external_provider TEXT,
    external_tournament_id TEXT,
    sport_id TEXT REFERENCES public.sports(id),
    active_ruleset_id UUID REFERENCES public.prode_rulesets(id) ON DELETE SET NULL,
    prediction_lead_minutes INTEGER NOT NULL DEFAULT 0,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prode_competitions_source_binding_chk CHECK (
        (source_type = 'local' AND local_tournament_id IS NOT NULL)
        OR (source_type = 'external' AND external_provider IS NOT NULL AND external_tournament_id IS NOT NULL)
        OR (source_type = 'mixed')
    )
);

CREATE TABLE IF NOT EXISTS public.prode_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.prode_competitions(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('local', 'external')),
    local_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    external_provider TEXT,
    external_match_id TEXT,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    home_label TEXT NOT NULL,
    away_label TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    locks_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'final', 'postponed', 'cancelled', 'scored')),
    scoring_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (scoring_status IN ('pending', 'ready', 'scored', 'needs_recalc', 'void')),
    official_result JSONB,
    match_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prode_events_source_binding_chk CHECK (
        (source_type = 'local' AND local_match_id IS NOT NULL)
        OR (source_type = 'external' AND external_provider IS NOT NULL AND external_match_id IS NOT NULL)
    ),
    CONSTRAINT prode_events_lock_before_start_chk CHECK (locks_at <= starts_at)
);

CREATE TABLE IF NOT EXISTS public.prode_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.prode_competitions(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.prode_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    predicted_outcome TEXT CHECK (predicted_outcome IN ('home', 'draw', 'away')),
    predicted_home_score INTEGER,
    predicted_away_score INTEGER,
    predicted_qualifier TEXT CHECK (predicted_qualifier IN ('home', 'away')),
    bonus_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    scoring_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    points_awarded NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'locked', 'scored', 'void')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prode_predictions_unique_user_event UNIQUE (event_id, user_id),
    CONSTRAINT prode_predictions_score_pair_chk CHECK (
        (predicted_home_score IS NULL AND predicted_away_score IS NULL)
        OR (predicted_home_score IS NOT NULL AND predicted_away_score IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.prode_competition_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.prode_competitions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'banned')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prode_competition_members_unique UNIQUE (competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.prode_private_leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.prode_competitions(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'public')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prode_private_leagues_slug_unique_per_competition UNIQUE (competition_id, slug)
);

CREATE TABLE IF NOT EXISTS public.prode_private_league_members (
    private_league_id UUID NOT NULL REFERENCES public.prode_private_leagues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'member', 'moderator')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (private_league_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.prode_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.prode_competitions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    scope_type TEXT NOT NULL DEFAULT 'global'
        CHECK (scope_type IN ('global', 'round', 'private_league')),
    round_key TEXT,
    private_league_id UUID REFERENCES public.prode_private_leagues(id) ON DELETE CASCADE,
    total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
    exact_hits INTEGER NOT NULL DEFAULT 0,
    correct_outcomes INTEGER NOT NULL DEFAULT 0,
    position INTEGER,
    tie_break_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prode_rankings_scope_unique UNIQUE (competition_id, user_id, scope_type, round_key, private_league_id)
);

CREATE TABLE IF NOT EXISTS public.prode_user_totals (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
    exact_hits INTEGER NOT NULL DEFAULT 0,
    correct_outcomes INTEGER NOT NULL DEFAULT 0,
    competitions_joined INTEGER NOT NULL DEFAULT 0,
    competitions_scored INTEGER NOT NULL DEFAULT 0,
    position INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prode_prediction_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL REFERENCES public.prode_predictions(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prode_competitions_status_visibility
    ON public.prode_competitions(status, visibility);
CREATE INDEX IF NOT EXISTS idx_prode_competitions_local_tournament_id
    ON public.prode_competitions(local_tournament_id);
CREATE INDEX IF NOT EXISTS idx_prode_competitions_external_tournament
    ON public.prode_competitions(external_provider, external_tournament_id);
CREATE INDEX IF NOT EXISTS idx_prode_events_competition_id
    ON public.prode_events(competition_id);
CREATE INDEX IF NOT EXISTS idx_prode_events_starts_at
    ON public.prode_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_prode_events_locks_at
    ON public.prode_events(locks_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prode_events_unique_local
    ON public.prode_events(competition_id, local_match_id)
    WHERE local_match_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prode_events_unique_external
    ON public.prode_events(competition_id, external_provider, external_match_id)
    WHERE external_match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prode_predictions_user_id
    ON public.prode_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_prode_predictions_competition_id
    ON public.prode_predictions(competition_id);
CREATE INDEX IF NOT EXISTS idx_prode_competition_members_competition
    ON public.prode_competition_members(competition_id, status);
CREATE INDEX IF NOT EXISTS idx_prode_competition_members_user
    ON public.prode_competition_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_prode_rankings_competition_scope
    ON public.prode_rankings(competition_id, scope_type, position);
CREATE INDEX IF NOT EXISTS idx_prode_user_totals_position
    ON public.prode_user_totals(position, total_points DESC);

DROP TRIGGER IF EXISTS trg_prode_rulesets_updated_at ON public.prode_rulesets;
CREATE TRIGGER trg_prode_rulesets_updated_at
    BEFORE UPDATE ON public.prode_rulesets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_competitions_updated_at ON public.prode_competitions;
CREATE TRIGGER trg_prode_competitions_updated_at
    BEFORE UPDATE ON public.prode_competitions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_events_updated_at ON public.prode_events;
CREATE TRIGGER trg_prode_events_updated_at
    BEFORE UPDATE ON public.prode_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_predictions_updated_at ON public.prode_predictions;
CREATE TRIGGER trg_prode_predictions_updated_at
    BEFORE UPDATE ON public.prode_predictions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_private_leagues_updated_at ON public.prode_private_leagues;
CREATE TRIGGER trg_prode_private_leagues_updated_at
    BEFORE UPDATE ON public.prode_private_leagues
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_competition_members_updated_at ON public.prode_competition_members;
CREATE TRIGGER trg_prode_competition_members_updated_at
    BEFORE UPDATE ON public.prode_competition_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_rankings_updated_at ON public.prode_rankings;
CREATE TRIGGER trg_prode_rankings_updated_at
    BEFORE UPDATE ON public.prode_rankings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prode_user_totals_updated_at ON public.prode_user_totals;
CREATE TRIGGER trg_prode_user_totals_updated_at
    BEFORE UPDATE ON public.prode_user_totals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.prode_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_competition_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_private_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_private_league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_user_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_prediction_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_prode_competitions" ON public.prode_competitions;
CREATE POLICY "public_read_prode_competitions" ON public.prode_competitions
    FOR SELECT USING (
        visibility = 'public' AND status IN ('published', 'active', 'finished')
    );

DROP POLICY IF EXISTS "public_read_prode_events" ON public.prode_events;
CREATE POLICY "public_read_prode_events" ON public.prode_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.prode_competitions pc
            WHERE pc.id = competition_id
              AND pc.visibility = 'public'
              AND pc.status IN ('published', 'active', 'finished')
        )
    );

DROP POLICY IF EXISTS "users_read_own_prode_predictions" ON public.prode_predictions;
CREATE POLICY "users_read_own_prode_predictions" ON public.prode_predictions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_open_prode_predictions" ON public.prode_predictions;
CREATE POLICY "users_insert_open_prode_predictions" ON public.prode_predictions
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.prode_events pe
            WHERE pe.id = event_id
              AND pe.competition_id = competition_id
              AND pe.locks_at > now()
              AND pe.status IN ('scheduled', 'live')
        )
    );

DROP POLICY IF EXISTS "users_update_open_prode_predictions" ON public.prode_predictions;
CREATE POLICY "users_update_open_prode_predictions" ON public.prode_predictions
    FOR UPDATE USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.prode_events pe
            WHERE pe.id = event_id
              AND pe.locks_at > now()
              AND pe.status IN ('scheduled', 'live')
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.prode_events pe
            WHERE pe.id = event_id
              AND pe.locks_at > now()
              AND pe.status IN ('scheduled', 'live')
        )
    );

DROP POLICY IF EXISTS "users_read_own_prode_competition_memberships" ON public.prode_competition_members;
CREATE POLICY "users_read_own_prode_competition_memberships" ON public.prode_competition_members
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1
            FROM public.prode_competitions pc
            WHERE pc.id = competition_id
              AND pc.visibility = 'public'
              AND pc.status IN ('published', 'active', 'finished')
        )
    );

DROP POLICY IF EXISTS "users_join_prode_competitions" ON public.prode_competition_members;
CREATE POLICY "users_join_prode_competitions" ON public.prode_competition_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.prode_competitions pc
            WHERE pc.id = competition_id
              AND pc.status IN ('published', 'active')
              AND pc.visibility IN ('public', 'unlisted')
        )
    );

DROP POLICY IF EXISTS "users_update_own_prode_competition_memberships" ON public.prode_competition_members;
CREATE POLICY "users_update_own_prode_competition_memberships" ON public.prode_competition_members
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "public_read_prode_rankings" ON public.prode_rankings;
CREATE POLICY "public_read_prode_rankings" ON public.prode_rankings
    FOR SELECT USING (
        scope_type = 'global'
        AND EXISTS (
            SELECT 1
            FROM public.prode_competitions pc
            WHERE pc.id = competition_id
              AND pc.visibility = 'public'
              AND pc.status IN ('published', 'active', 'finished')
        )
    );

DROP POLICY IF EXISTS "public_read_prode_user_totals" ON public.prode_user_totals;
CREATE POLICY "public_read_prode_user_totals" ON public.prode_user_totals
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_read_own_private_leagues" ON public.prode_private_leagues;
CREATE POLICY "users_read_own_private_leagues" ON public.prode_private_leagues
    FOR SELECT USING (
        owner_user_id = auth.uid()
        OR visibility = 'public'
        OR EXISTS (
            SELECT 1
            FROM public.prode_private_league_members plm
            WHERE plm.private_league_id = id
              AND plm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "users_manage_owned_private_leagues" ON public.prode_private_leagues;
CREATE POLICY "users_manage_owned_private_leagues" ON public.prode_private_leagues
    FOR ALL USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_private_league_memberships" ON public.prode_private_league_members;
CREATE POLICY "users_read_private_league_memberships" ON public.prode_private_league_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.prode_private_leagues pll
            WHERE pll.id = private_league_id
              AND pll.owner_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "users_join_private_leagues" ON public.prode_private_league_members;
CREATE POLICY "users_join_private_leagues" ON public.prode_private_league_members
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_own_prediction_audit" ON public.prode_prediction_audit;
CREATE POLICY "users_read_own_prediction_audit" ON public.prode_prediction_audit
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.prode_predictions pp
            WHERE pp.id = prediction_id
              AND pp.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "admin_all_prode_rulesets" ON public.prode_rulesets;
CREATE POLICY "admin_all_prode_rulesets" ON public.prode_rulesets
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_competitions" ON public.prode_competitions;
CREATE POLICY "admin_all_prode_competitions" ON public.prode_competitions
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_events" ON public.prode_events;
CREATE POLICY "admin_all_prode_events" ON public.prode_events
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_predictions" ON public.prode_predictions;
CREATE POLICY "admin_all_prode_predictions" ON public.prode_predictions
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_private_leagues" ON public.prode_private_leagues;
CREATE POLICY "admin_all_prode_private_leagues" ON public.prode_private_leagues
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_competition_members" ON public.prode_competition_members;
CREATE POLICY "admin_all_prode_competition_members" ON public.prode_competition_members
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_private_league_members" ON public.prode_private_league_members;
CREATE POLICY "admin_all_prode_private_league_members" ON public.prode_private_league_members
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_rankings" ON public.prode_rankings;
CREATE POLICY "admin_all_prode_rankings" ON public.prode_rankings
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_user_totals" ON public.prode_user_totals;
CREATE POLICY "admin_all_prode_user_totals" ON public.prode_user_totals
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_prode_prediction_audit" ON public.prode_prediction_audit;
CREATE POLICY "admin_all_prode_prediction_audit" ON public.prode_prediction_audit
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
