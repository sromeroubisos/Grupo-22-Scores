-- ============================================
-- TOURNAMENT MANAGEMENT: Phases, Participants, Standings
-- ============================================

-- ─── PHASES / STAGES ─────────────────────────────────────────────────────
-- A tournament can have multiple phases (e.g., "Liga Regular", "Playoffs")
CREATE TABLE IF NOT EXISTS public.tournament_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phase_type TEXT CHECK (phase_type IN ('league', 'knockout', 'group_stage', 'playoff')) DEFAULT 'league',
    order_index INT NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}'::jsonb, -- round-robin, home/away, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_tournament_phases_tournament ON public.tournament_phases(tournament_id, order_index);

-- ─── GROUPS / ZONES ──────────────────────────────────────────────────────
-- Within a phase, teams can be divided into groups/zones
CREATE TABLE IF NOT EXISTS public.tournament_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- "Grupo A", "Zona Norte"
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phase_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tournament_groups_phase ON public.tournament_groups(phase_id);

-- ─── PARTICIPANTS ────────────────────────────────────────────────────────
-- Teams participating in a tournament
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    seed INT, -- seeding for knockout phases
    status TEXT CHECK (status IN ('active', 'withdrawn', 'disqualified')) DEFAULT 'active',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club ON public.tournament_participants(club_id);

-- ─── STANDINGS ───────────────────────────────────────────────────────────
-- Calculated standings (can be per group or overall)
CREATE TABLE IF NOT EXISTS public.tournament_standings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,

    -- Core stats
    position INT NOT NULL DEFAULT 0,
    played INT NOT NULL DEFAULT 0,
    won INT NOT NULL DEFAULT 0,
    drawn INT NOT NULL DEFAULT 0,
    lost INT NOT NULL DEFAULT 0,
    points INT NOT NULL DEFAULT 0,

    -- Scoring stats (flexible for rugby/football/etc)
    scored INT NOT NULL DEFAULT 0, -- tries/goals scored
    conceded INT NOT NULL DEFAULT 0,
    bonus_points INT NOT NULL DEFAULT 0,

    -- Form and streaks
    form TEXT, -- "WWDLL" last 5 matches
    streak TEXT, -- "3W", "2L"

    -- Additional metadata
    stats JSONB DEFAULT '{}'::jsonb, -- discipline, yellow/red cards, etc.
    last_updated TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tournament_id, phase_id, group_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_standings_tournament ON public.tournament_standings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_standings_phase_group ON public.tournament_standings(phase_id, group_id, position);

-- ─── MEDIA & BRANDING ────────────────────────────────────────────────────
-- Store tournament media assets and branding
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS banner_url TEXT,
    ADD COLUMN IF NOT EXISTS primary_color TEXT,
    ADD COLUMN IF NOT EXISTS secondary_color TEXT,
    ADD COLUMN IF NOT EXISTS sponsors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS streaming_url TEXT;

-- ─── RLS POLICIES ────────────────────────────────────────────────────────

ALTER TABLE public.tournament_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_standings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "public_read_phases" ON public.tournament_phases;
    DROP POLICY IF EXISTS "public_read_groups" ON public.tournament_groups;
    DROP POLICY IF EXISTS "public_read_participants" ON public.tournament_participants;
    DROP POLICY IF EXISTS "public_read_standings" ON public.tournament_standings;
    DROP POLICY IF EXISTS "admin_manage_phases" ON public.tournament_phases;
    DROP POLICY IF EXISTS "admin_manage_groups" ON public.tournament_groups;
    DROP POLICY IF EXISTS "admin_manage_participants" ON public.tournament_participants;
    DROP POLICY IF EXISTS "admin_manage_standings" ON public.tournament_standings;
END $$;

-- Public read for all
CREATE POLICY "public_read_phases" ON public.tournament_phases FOR SELECT USING (true);
CREATE POLICY "public_read_groups" ON public.tournament_groups FOR SELECT USING (true);
CREATE POLICY "public_read_participants" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "public_read_standings" ON public.tournament_standings FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "admin_manage_phases" ON public.tournament_phases FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

CREATE POLICY "admin_manage_groups" ON public.tournament_groups FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

CREATE POLICY "admin_manage_participants" ON public.tournament_participants FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

CREATE POLICY "admin_manage_standings" ON public.tournament_standings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

-- ─── HELPER FUNCTIONS ────────────────────────────────────────────────────

-- Function to recalculate standings for a tournament
CREATE OR REPLACE FUNCTION public.recalculate_tournament_standings(p_tournament_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete existing standings
    DELETE FROM public.tournament_standings WHERE tournament_id = p_tournament_id;

    -- Insert fresh standings based on matches
    INSERT INTO public.tournament_standings (
        tournament_id, phase_id, group_id, club_id,
        played, won, drawn, lost, points, scored, conceded
    )
    SELECT
        p_tournament_id,
        NULL as phase_id,
        tp.group_id,
        tp.club_id,
        COALESCE(COUNT(m.id), 0) as played,
        COALESCE(SUM(CASE
            WHEN (m.home_club_id = tp.club_id AND (m.score->>'home')::int > (m.score->>'away')::int) THEN 1
            WHEN (m.away_club_id = tp.club_id AND (m.score->>'away')::int > (m.score->>'home')::int) THEN 1
            ELSE 0
        END), 0) as won,
        COALESCE(SUM(CASE
            WHEN m.status = 'final' AND (m.score->>'home')::int = (m.score->>'away')::int THEN 1
            ELSE 0
        END), 0) as drawn,
        COALESCE(SUM(CASE
            WHEN (m.home_club_id = tp.club_id AND (m.score->>'home')::int < (m.score->>'away')::int) THEN 1
            WHEN (m.away_club_id = tp.club_id AND (m.score->>'away')::int < (m.score->>'home')::int) THEN 1
            ELSE 0
        END), 0) as lost,
        -- Simple points calculation (3 for win, 1 for draw) - can be customized per ruleset
        COALESCE(SUM(CASE
            WHEN (m.home_club_id = tp.club_id AND (m.score->>'home')::int > (m.score->>'away')::int) THEN 3
            WHEN (m.away_club_id = tp.club_id AND (m.score->>'away')::int > (m.score->>'home')::int) THEN 3
            WHEN m.status = 'final' AND (m.score->>'home')::int = (m.score->>'away')::int THEN 1
            ELSE 0
        END), 0) as points,
        COALESCE(SUM(CASE
            WHEN m.home_club_id = tp.club_id THEN (m.score->>'home')::int
            WHEN m.away_club_id = tp.club_id THEN (m.score->>'away')::int
            ELSE 0
        END), 0) as scored,
        COALESCE(SUM(CASE
            WHEN m.home_club_id = tp.club_id THEN (m.score->>'away')::int
            WHEN m.away_club_id = tp.club_id THEN (m.score->>'home')::int
            ELSE 0
        END), 0) as conceded
    FROM public.tournament_participants tp
    LEFT JOIN public.matches m ON (
        m.tournament_id = p_tournament_id
        AND (m.home_club_id = tp.club_id OR m.away_club_id = tp.club_id)
        AND m.status = 'final'
    )
    WHERE tp.tournament_id = p_tournament_id
    GROUP BY tp.club_id, tp.group_id;

    -- Update positions based on points (descending), then goal difference
    WITH ranked AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY group_id
                ORDER BY points DESC, (scored - conceded) DESC, scored DESC
            ) as new_position
        FROM public.tournament_standings
        WHERE tournament_id = p_tournament_id
    )
    UPDATE public.tournament_standings s
    SET position = r.new_position, last_updated = NOW()
    FROM ranked r
    WHERE s.id = r.id;

END;
$$;
