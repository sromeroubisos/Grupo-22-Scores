-- ============================================================
-- MIGRATION: Fix get_all_tournaments RPC after schema simplification
-- Reason: 20260318100000_schema_simplification_core.sql dropped several
--         columns from the tournaments table that the RPC still references:
--           - organization_id  (→ replaced by union_id::text)
--           - original_name    (→ NULL)
--           - is_api_managed   (→ false)
--           - data_source      (→ NULL)
--           - display_order    (→ NULL)
--           - is_active        (→ derived from status/is_visible)
--           - external_id      (→ NULL)
-- ============================================================

-- Drop all existing overloads of get_all_tournaments
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'get_all_tournaments'
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || quote_ident(r.nspname) || '.' || quote_ident(r.proname) || '(' || r.args || ')';
    END LOOP;
END $$;

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
    IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id <> '' THEN
        v_actual_user_id := p_viewer_user_id::UUID;
    ELSE
        v_actual_user_id := auth.uid();
    END IF;

    RETURN QUERY
    WITH follow_stats AS (
        SELECT
            tf.tournament_id,
            COUNT(*) AS count,
            MAX(CASE WHEN tf.user_id = v_actual_user_id THEN 1 ELSE 0 END)::BOOLEAN AS user_follows
        FROM public.tournament_followers tf
        GROUP BY tf.tournament_id
    )
    SELECT
        t.id::text,
        t.name,
        t.slug,
        t.sport_id,
        s.name AS sport_name,
        t.country_id,
        c.name AS country_name,
        -- organization_id column was dropped; fall back to union_id
        t.union_id::text AS organization_id,
        u.name AS organization_name,
        t.logo_url,
        t.is_popular,
        -- is_active column was dropped; derive from status / is_visible
        (COALESCE(t.status, 'published') IN ('active', 'published') AND COALESCE(t.is_visible, true)) AS is_active,
        -- display_order column was dropped
        NULL::integer AS display_order,
        t.season_id,
        t.status,
        t.category,
        t.age_grade,
        t.format,
        t.is_visible,
        -- is_api_managed column was dropped
        false AS is_api_managed,
        -- data_source column was dropped
        NULL::text AS data_source,
        t.display_name,
        -- original_name column was dropped
        NULL::text AS original_name,
        t.union_id::text,
        -- external_id column was dropped
        NULL::text AS external_id,
        COALESCE(fs.count, 0)::BIGINT AS followers_count,
        COALESCE(fs.user_follows, false) AS is_followed_by_user,
        t.created_at,
        t.updated_at
    FROM
        public.tournaments t
    LEFT JOIN public.sports s ON t.sport_id = s.id
    LEFT JOIN public.countries c ON t.country_id = c.id
    LEFT JOIN public.unions u ON t.union_id = u.id
    LEFT JOIN follow_stats fs ON t.id = fs.tournament_id
    WHERE
        (p_include_hidden OR (COALESCE(t.is_visible, true) = true))
    ORDER BY
        t.is_popular DESC,
        t.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
