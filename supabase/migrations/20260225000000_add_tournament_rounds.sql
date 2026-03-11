-- ============================================
-- TOURNAMENT ROUNDS (JORNADAS/FECHAS)
-- ============================================
-- Adds proper round/matchday structure to tournaments
-- Tournament → Phase → Round → Matches

-- ─── ROUNDS / MATCHDAYS ──────────────────────────────────────────────────
-- Each phase has multiple rounds (jornadas/fechas)
CREATE TABLE IF NOT EXISTS public.tournament_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- "Fecha 1", "Jornada 3", "Cuartos de Final"
    order_index INT NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_completed BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phase_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_phase ON public.tournament_rounds(phase_id, order_index);

-- ─── UPDATE MATCHES TABLE ────────────────────────────────────────────────
-- Add foreign key reference to tournament_rounds and additional fields
ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS round_uuid UUID REFERENCES public.tournament_rounds(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.tournament_phases(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referee TEXT,
    ADD COLUMN IF NOT EXISTS pitch TEXT,
    ADD COLUMN IF NOT EXISTS attendance INT,
    ADD COLUMN IF NOT EXISTS weather JSONB,
    ADD COLUMN IF NOT EXISTS broadcast_url TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_matches_round ON public.matches(round_uuid);
CREATE INDEX IF NOT EXISTS idx_matches_phase ON public.matches(phase_id);
CREATE INDEX IF NOT EXISTS idx_matches_group ON public.matches(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_datetime ON public.matches(date_time);

-- ─── RLS POLICIES ────────────────────────────────────────────────────────
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;

-- Public read for all
CREATE POLICY "public_read_rounds" ON public.tournament_rounds FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "admin_manage_rounds" ON public.tournament_rounds FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin'))
);

-- ─── HELPER FUNCTIONS ────────────────────────────────────────────────────

-- Function to auto-generate rounds for a phase
CREATE OR REPLACE FUNCTION public.generate_rounds_for_phase(
    p_phase_id UUID,
    p_num_rounds INT,
    p_name_pattern TEXT DEFAULT 'Fecha {n}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_round_name TEXT;
    v_i INT;
BEGIN
    FOR v_i IN 1..p_num_rounds LOOP
        v_round_name := REPLACE(p_name_pattern, '{n}', v_i::TEXT);

        INSERT INTO public.tournament_rounds (phase_id, name, order_index)
        VALUES (p_phase_id, v_round_name, v_i)
        ON CONFLICT (phase_id, order_index) DO NOTHING;
    END LOOP;
END;
$$;

-- Function to get fixture structure for a tournament
CREATE OR REPLACE FUNCTION public.get_tournament_fixture(p_tournament_id UUID)
RETURNS TABLE (
    phase_id UUID,
    phase_name TEXT,
    phase_type TEXT,
    phase_order INT,
    round_id UUID,
    round_name TEXT,
    round_order INT,
    match_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tp.id as phase_id,
        tp.name as phase_name,
        tp.phase_type,
        tp.order_index as phase_order,
        tr.id as round_id,
        tr.name as round_name,
        tr.order_index as round_order,
        COUNT(m.id) as match_count
    FROM public.tournament_phases tp
    LEFT JOIN public.tournament_rounds tr ON tr.phase_id = tp.id
    LEFT JOIN public.matches m ON m.round_uuid = tr.id
    WHERE tp.tournament_id = p_tournament_id
    GROUP BY tp.id, tp.name, tp.phase_type, tp.order_index, tr.id, tr.name, tr.order_index
    ORDER BY tp.order_index, tr.order_index;
END;
$$;

-- Function to get matches for a specific round
CREATE OR REPLACE FUNCTION public.get_round_matches(p_round_id UUID)
RETURNS TABLE (
    match_id UUID,
    date_time TIMESTAMPTZ,
    venue TEXT,
    pitch TEXT,
    home_club_id TEXT,
    home_club_name TEXT,
    away_club_id TEXT,
    away_club_name TEXT,
    status TEXT,
    score JSONB,
    referee TEXT,
    attendance INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id as match_id,
        m.date_time,
        m.venue,
        m.pitch,
        m.home_club_id,
        hc.name as home_club_name,
        m.away_club_id,
        ac.name as away_club_name,
        m.status,
        m.score,
        m.referee,
        m.attendance
    FROM public.matches m
    LEFT JOIN public.clubs hc ON hc.id = m.home_club_id
    LEFT JOIN public.clubs ac ON ac.id = m.away_club_id
    WHERE m.round_uuid = p_round_id
    ORDER BY m.date_time;
END;
$$;

-- Function to mark round as completed
CREATE OR REPLACE FUNCTION public.complete_round(p_round_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if all matches in the round are final
    IF NOT EXISTS (
        SELECT 1 FROM public.matches
        WHERE round_uuid = p_round_id
        AND status NOT IN ('final', 'postponed')
    ) THEN
        UPDATE public.tournament_rounds
        SET is_completed = TRUE, updated_at = NOW()
        WHERE id = p_round_id;
    END IF;
END;
$$;

-- Trigger to auto-complete rounds when all matches are final
CREATE OR REPLACE FUNCTION public.auto_complete_round()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'final' AND NEW.round_uuid IS NOT NULL THEN
        PERFORM public.complete_round(NEW.round_uuid);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_complete_round
AFTER UPDATE ON public.matches
FOR EACH ROW
WHEN (NEW.status = 'final' AND OLD.status != 'final')
EXECUTE FUNCTION public.auto_complete_round();
