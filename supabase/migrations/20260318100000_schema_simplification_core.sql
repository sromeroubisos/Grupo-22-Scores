-- ============================================
-- SCHEMA SIMPLIFICATION AND REDUCTION (CORE)
-- Strategy: Core + Extensions + Advanced Modules
-- ============================================

-- START TRANSACTION
BEGIN;

-- 1. UNIFY FAVORITES
-- Ensure we have a single favorites table and drop duplicates if they exist.
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_type, entity_id)
);

-- Drop legacy/extra favorites tables if they exist
DROP TABLE IF EXISTS public.favorites_clubs;
DROP TABLE IF EXISTS public.favorites_tournaments;

-- 2. SIMPLIFY SPORTS
-- Keep: id, name, slug, icon, is_active, is_visible, display_order
ALTER TABLE public.sports DROP COLUMN IF EXISTS group_key;
ALTER TABLE public.sports DROP COLUMN IF EXISTS group_name;
ALTER TABLE public.sports DROP COLUMN IF EXISTS updated_by;
ALTER TABLE public.sports DROP COLUMN IF EXISTS api_sport_id;
ALTER TABLE public.sports DROP COLUMN IF EXISTS sport_url;
ALTER TABLE public.sports DROP COLUMN IF EXISTS name_es; -- Keeping it simple as per request
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 3. SIMPLIFY CLUBS
-- Keep: id, union_id, sport_id, name, short_name, slug, city, region, country, logo_url, primary_color, category, entity_type, status, is_visible, created_at, updated_at
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS sport_id TEXT REFERENCES public.sports(id);
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Remove non-essential columns from core
ALTER TABLE public.clubs DROP COLUMN IF EXISTS categories;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS visibility;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS lifecycle;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS source;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS sync_status;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS lat;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS lng;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS address;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS notes_internal;
ALTER TABLE public.clubs DROP COLUMN IF EXISTS last_sync_at;
-- external_id is useful but user mentioned moving it or removing from core. I'll keep it for now if it's already used as key, or remove if strictly following "move_or_remove"
-- Actually, the user's "Recommended Simplified Model" for clubs doesn't list external_id.
ALTER TABLE public.clubs DROP COLUMN IF EXISTS external_id;

-- 4. SIMPLIFY TOURNAMENTS
-- Keep: id, union_id, sport_id, country_id, season_id, name, slug, display_name, category, age_grade, format, status, is_visible, is_popular, logo_url, banner_url, primary_color, secondary_color, ruleset, created_at, updated_at
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS sport_id TEXT REFERENCES public.sports(id);
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS country_id TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS age_grade TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS ruleset TEXT;

-- Migration: if sport column exists as text, try to map it to sport_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='sport') THEN
        UPDATE public.tournaments SET sport_id = sport WHERE sport_id IS NULL;
        ALTER TABLE public.tournaments DROP COLUMN sport;
    END IF;
END $$;

-- Drop non-essential columns
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS original_name;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS url;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS is_api_managed;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS data_source;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS priority;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS social_links;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS sponsors;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS streaming_url;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS custom_logo_url;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS original_logo_url;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS display_order;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS is_active; -- Replaced by status/is_visible
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS external_id;

-- 5. SIMPLIFY MATCHES
-- Keep: id, tournament_id, phase_id, group_id, round_id, date_time, home_club_id, away_club_id, venue, status, score, round_label, notes, created_at, updated_at
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS phase_id UUID;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS group_id UUID;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round_label TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS notes TEXT;

-- Drop complex modules from core match table
ALTER TABLE public.matches DROP COLUMN IF EXISTS live_enabled;
ALTER TABLE public.matches DROP COLUMN IF EXISTS clock;
ALTER TABLE public.matches DROP COLUMN IF EXISTS lineups;
ALTER TABLE public.matches DROP COLUMN IF EXISTS events;
ALTER TABLE public.matches DROP COLUMN IF EXISTS stream_url;
ALTER TABLE public.matches DROP COLUMN IF EXISTS replay_url;
ALTER TABLE public.matches DROP COLUMN IF EXISTS referee;
ALTER TABLE public.matches DROP COLUMN IF EXISTS pitch;
ALTER TABLE public.matches DROP COLUMN IF EXISTS attendance;
ALTER TABLE public.matches DROP COLUMN IF EXISTS weather;
ALTER TABLE public.matches DROP COLUMN IF EXISTS broadcast_url;

-- 6. UNIFY PHASE CONFIGURATION
-- Migrate phase_configurations to tournament_phases.settings
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='phase_configurations') THEN
        -- This is a simplified migration, might need refinement if actual data is complex
        UPDATE public.tournament_phases tp
        SET settings = jsonb_set(COALESCE(tp.settings, '{}'::jsonb), '{config}', pc.config)
        FROM public.phase_configurations pc
        WHERE tp.tournament_id = pc.tournament_id AND tp.name = pc.name;
        
        DROP TABLE public.phase_configurations;
    END IF;
END $$;

-- 7. SEPARATE ADVANCED MODULES (DROP FOR MVP)
DROP TABLE IF EXISTS public.admin_audit_log CASCADE;
DROP TABLE IF EXISTS public.import_jobs CASCADE;
DROP TABLE IF EXISTS public.import_rows CASCADE;
DROP TABLE IF EXISTS public.import_match_previews CASCADE;
DROP TABLE IF EXISTS public.import_logs CASCADE;
DROP TABLE IF EXISTS public.import_files CASCADE;
DROP TABLE IF EXISTS public.external_data CASCADE;
DROP TABLE IF EXISTS public.external_match_cache CASCADE;
DROP TABLE IF EXISTS public.external_teams CASCADE;
DROP TABLE IF EXISTS public.people CASCADE;
DROP TABLE IF EXISTS public.club_divisions CASCADE;
DROP TABLE IF EXISTS public.club_person_roles CASCADE;
DROP TABLE IF EXISTS public.squad_members CASCADE;
DROP TABLE IF EXISTS public.discipline_incidents CASCADE;
DROP TABLE IF EXISTS public.discipline_sanctions CASCADE;
DROP TABLE IF EXISTS public.tournament_relations CASCADE;
DROP TABLE IF EXISTS public.memberships CASCADE;
DROP TABLE IF EXISTS public.regulations CASCADE;
DROP TABLE IF EXISTS public.tournament_rulesets CASCADE;
DROP TABLE IF EXISTS public.seasons CASCADE;

-- 8. RESET RLS (Simplified version)
-- Disable/Enable RLS to clear old policies if needed, or just drop and recreate
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    END LOOP;
END $$;

-- Policies for Tournaments, Clubs, Matches, Sports, Countries, Unions (Public Read)
DO $$
BEGIN
    -- This is a placeholder for a more comprehensive RLS reset in a separate file if preferred
    -- For now, let's just make sure the core tables are readable
    DROP POLICY IF EXISTS "public_read_all" ON public.tournaments;
    CREATE POLICY "public_read_all" ON public.tournaments FOR SELECT USING (is_visible = true);
    
    DROP POLICY IF EXISTS "public_read_all" ON public.clubs;
    CREATE POLICY "public_read_all" ON public.clubs FOR SELECT USING (is_visible = true);
    
    DROP POLICY IF EXISTS "public_read_all" ON public.matches;
    CREATE POLICY "public_read_all" ON public.matches FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "public_read_all" ON public.sports;
    CREATE POLICY "public_read_all" ON public.sports FOR SELECT USING (is_visible = true);
END $$;

COMMIT;
