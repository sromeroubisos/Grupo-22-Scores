-- ============================================================
-- Global Tournaments Centralized Architecture
-- Created: 2026-03-12
-- ============================================================

-- 1. Extend tournaments table with required tracking and administration fields
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS display_order INTEGER,
ADD COLUMN IF NOT EXISTS organization_id TEXT;

-- 2. Create tournament_followers table for user engagement
CREATE TABLE IF NOT EXISTS public.tournament_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, tournament_id)
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_sport_id ON public.tournaments(sport_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_country_id ON public.tournaments(country_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_organization_id ON public.tournaments(organization_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_popular ON public.tournaments(is_popular);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_active ON public.tournaments(is_active);
CREATE INDEX IF NOT EXISTS idx_tournament_followers_tournament_id ON public.tournament_followers(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_followers_user_id ON public.tournament_followers(user_id);

-- 4. Row Level Security for Followers
ALTER TABLE public.tournament_followers ENABLE ROW LEVEL SECURITY;

-- Everyone can see counts (public access)
CREATE POLICY "Public can view follower stats" 
ON public.tournament_followers FOR SELECT USING (true);

-- Authenticated users manage their own follows
CREATE POLICY "Users manage own follows" 
ON public.tournament_followers FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Centralized RPC for Tournament Discovery & Administration
-- This handles follows, counts, and metadata in one request
CREATE OR REPLACE FUNCTION public.get_all_tournaments(
    p_viewer_user_id UUID DEFAULT NULL,
    p_include_hidden BOOLEAN DEFAULT false
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    sport_id TEXT,
    sport_name TEXT,
    country_id TEXT,
    country_name TEXT,
    organization_id TEXT,
    organization_name TEXT,
    logo_url TEXT,
    is_popular BOOLEAN,
    is_active BOOLEAN,
    display_order INTEGER,
    -- New fields
    season_id TEXT,
    status TEXT,
    category TEXT,
    age_grade TEXT,
    format TEXT,
    is_visible BOOLEAN,
    is_api_managed BOOLEAN,
    data_source TEXT,
    display_name TEXT,
    original_name TEXT,
    union_id UUID,
    external_id TEXT,
    -- end new fields
    followers_count BIGINT,
    is_followed_by_user BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.name,
        t.slug,
        t.sport_id,
        s.name as sport_name,
        t.country_id,
        c.name as country_name,
        COALESCE(t.organization_id, t.union_id) as organization_id,
        u.name as organization_name,
        t.logo_url,
        t.is_popular,
        t.is_active,
        t.display_order,
        -- Administrative Fields
        t.season_id,
        t.status,
        t.category,
        t.age_grade,
        t.format,
        t.is_visible,
        t.is_api_managed,
        t.data_source,
        t.display_name,
        t.original_name,
        t.union_id,
        t.external_id,
        -- Calculated Fields
        (SELECT COUNT(*) FROM public.tournament_followers tf WHERE tf.tournament_id = t.id) as followers_count,
        EXISTS(SELECT 1 FROM public.tournament_followers tf WHERE tf.tournament_id = t.id AND tf.user_id = COALESCE(p_viewer_user_id, auth.uid())) as is_followed_by_user,
        t.created_at,
        t.updated_at
    FROM 
        public.tournaments t
    LEFT JOIN public.sports s ON t.sport_id = s.id
    LEFT JOIN public.countries c ON t.country_id = c.id
    LEFT JOIN public.unions u ON t.union_id = u.id
    WHERE 
        (p_include_hidden OR t.is_active = true)
    ORDER BY 
        t.is_popular DESC,
        t.display_order ASC NULLS LAST, 
        t.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Helper RPC for toggle follow
CREATE OR REPLACE FUNCTION public.toggle_tournament_follow(
    p_tournament_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.tournament_followers 
        WHERE user_id = v_user_id AND tournament_id = p_tournament_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.tournament_followers 
        WHERE user_id = v_user_id AND tournament_id = p_tournament_id;
        RETURN false;
    ELSE
        INSERT INTO public.tournament_followers (user_id, tournament_id)
        VALUES (v_user_id, p_tournament_id);
        RETURN true;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Audit log support (optional but recommended)
-- Assuming an audit log system exists based on previous conversations
