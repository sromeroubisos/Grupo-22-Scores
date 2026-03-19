-- ============================================================
-- MIGRATION: Final Schema Consistency Fixes
-- Reason: Ensure all remaining RPCs and Views are compatible with 
--         the simplified schema (no organization_id, no sport column).
-- ============================================================

-- 1. Reload PostgREST schema cache immediately
-- This fixes "column does not exist" errors in auto-generated queries
NOTIFY pgrst, 'reload schema';

-- 2. Ensure recalculate_tournament_standings is safe
-- (Already appears safe in previous migrations, but we ensure it here)
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
        m.phase_id,
        m.group_id,
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
    GROUP BY tp.club_id, m.phase_id, m.group_id;

    -- Update positions
    WITH ranked AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY phase_id, group_id
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

-- 3. Fix get_round_matches RPC (dropped pitch, referee, attendance)
CREATE OR REPLACE FUNCTION public.get_round_matches(p_round_id UUID)
RETURNS TABLE (
    match_id UUID,
    date_time TIMESTAMPTZ,
    venue TEXT,
    home_club_id TEXT,
    home_club_name TEXT,
    away_club_id TEXT,
    away_club_name TEXT,
    status TEXT,
    score JSONB
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
        m.home_club_id,
        hc.name as home_club_name,
        m.away_club_id,
        ac.name as away_club_name,
        m.status,
        m.score
    FROM public.matches m
    LEFT JOIN public.clubs hc ON hc.id = m.home_club_id
    LEFT JOIN public.clubs ac ON ac.id = m.away_club_id
    WHERE m.round_uuid = p_round_id
    ORDER BY m.date_time;
END;
$$;

-- 4. Notify again to be absolutely sure
NOTIFY pgrst, 'reload schema';
