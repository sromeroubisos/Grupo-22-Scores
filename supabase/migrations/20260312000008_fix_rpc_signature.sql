-- ============================================================
-- Global Tournaments RPC - Signature Fix
-- ============================================================

-- Drop existing to avoid signature mismatch conflicts
DROP FUNCTION IF EXISTS public.get_all_tournaments(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_all_tournaments(BOOLEAN, UUID);
DROP FUNCTION IF EXISTS public.get_all_tournaments();

-- Recreate with the parameters in the order listed in the error message
-- and using TEXT for UUIDs to increase flexibility and avoid casting issues in PostgREST
CREATE OR REPLACE FUNCTION public.get_all_tournaments(
    p_include_hidden BOOLEAN DEFAULT false,
    p_viewer_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
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
    union_id TEXT,
    external_id TEXT,
    followers_count BIGINT,
    is_followed_by_user BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_actual_user_id UUID;
BEGIN
    -- Determine the user ID to check follows for.
    -- We try to cast the input TEXT to UUID if provided.
    IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id <> '' THEN
        v_actual_user_id := p_viewer_user_id::UUID;
    ELSE
        v_actual_user_id := auth.uid();
    END IF;

    RETURN QUERY
    WITH follow_stats AS (
        SELECT 
            tf.tournament_id, 
            COUNT(*) as count,
            MAX(CASE WHEN tf.user_id = v_actual_user_id THEN 1 ELSE 0 END)::BOOLEAN as user_follows
        FROM public.tournament_followers tf
        GROUP BY tf.tournament_id
    )
    SELECT 
        t.id::text,
        t.name,
        t.slug,
        t.sport_id,
        s.name as sport_name,
        t.country_id,
        c.name as country_name,
        COALESCE(t.organization_id, t.union_id::text) as organization_id,
        u.name as organization_name,
        t.logo_url,
        t.is_popular,
        t.is_active,
        t.display_order,
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
        t.union_id::text,
        t.external_id,
        COALESCE(fs.count, 0)::BIGINT as followers_count,
        COALESCE(fs.user_follows, false) as is_followed_by_user,
        t.created_at,
        t.updated_at
    FROM 
        public.tournaments t
    LEFT JOIN public.sports s ON t.sport_id = s.id
    LEFT JOIN public.countries c ON t.country_id = c.id
    LEFT JOIN public.unions u ON t.union_id = u.id
    LEFT JOIN follow_stats fs ON t.id = fs.tournament_id
    WHERE 
        (p_include_hidden OR (t.is_active = true AND (t.is_visible = true OR t.is_visible IS NULL)))
    ORDER BY 
        t.is_popular DESC,
        t.display_order ASC NULLS LAST, 
        t.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
