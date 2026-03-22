-- Restore explicit tournament priority ordering for public catalogue and admin management.

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

UPDATE public.tournaments
SET priority = 0
WHERE priority IS NULL;

COMMENT ON COLUMN public.tournaments.priority IS
    'Custom public ordering priority. Higher numbers are shown first; ties fall back to alphabetical order.';

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
    priority INTEGER,
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
        t.union_id::text AS organization_id,
        u.name AS organization_name,
        t.logo_url,
        t.is_popular,
        (COALESCE(t.status, 'published') IN ('active', 'published') AND COALESCE(t.is_visible, true)) AS is_active,
        NULL::integer AS display_order,
        COALESCE(t.priority, 0) AS priority,
        t.season_id,
        t.status,
        t.category,
        t.age_grade,
        t.format,
        t.is_visible,
        false AS is_api_managed,
        NULL::text AS data_source,
        t.display_name,
        NULL::text AS original_name,
        t.union_id::text,
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
        COALESCE(t.priority, 0) DESC,
        COALESCE(t.display_name, t.name) ASC,
        t.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
