-- ============================================================
-- MIGRATION: Fix Missing Columns and Schema Discrepancies
-- Description: Adds missing columns to tournaments, unions, and clubs
--              to match the expectations of the get_all_tournaments RPC
--              and the super admin dashboard fetchers.
-- ============================================================

-- 1. FIX TOURNAMENTS TABLE
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS sport_id TEXT,
    ADD COLUMN IF NOT EXISTS country_id TEXT,
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS age_grade TEXT,
    ADD COLUMN IF NOT EXISTS is_api_managed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS data_source TEXT,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS original_name TEXT,
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Backfill display_name if null
UPDATE public.tournaments SET display_name = name WHERE display_name IS NULL;

-- Backfill sport_id if null and sport column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'sport') THEN
        UPDATE public.tournaments SET sport_id = sport WHERE sport_id IS NULL;
    END IF;
END $$;

-- 2. FIX UNIONS TABLE
ALTER TABLE public.unions
    ADD COLUMN IF NOT EXISTS country TEXT;

-- 3. FIX CLUBS TABLE
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible',
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS short_name TEXT,
    ADD COLUMN IF NOT EXISTS primary_color TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'club',
    ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'rugby',
    ADD COLUMN IF NOT EXISTS lifecycle TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS notes_internal TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_status TEXT;

-- 4. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 5. THE ULTIMATE DROP FOR get_all_tournaments (Handles all signatures)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
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
    -- Determine the user ID to check follows for.
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
