-- ============================================
-- SCHEMA HARDENING V2: RELATIONAL MATCH EVENTS
-- ============================================

BEGIN;

-- 1. CREATE MATCH_EVENTS TABLE
-- Moving from JSONB to relational for better analytics and performance.

CREATE TABLE IF NOT EXISTS public.match_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    club_id TEXT REFERENCES public.clubs(id), -- Changed to TEXT to match clubs.id
    player_id UUID, -- Reference to potential future people/players table (no FK for now as it's dropped)
    player_name TEXT, -- Added for denormalized name
    event_type TEXT NOT NULL, -- 'goal', 'card_yellow', 'card_red', 'substitution', 'injury', etc.
    minute INTEGER, -- Minute of the match
    second INTEGER, -- Second of the match (optional)
    extra_time INTEGER, -- Extra time (e.g., 45+2)
    details JSONB, -- Event-specific details (e.g., 'half_time', 'outcome')
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ADD INDICES FOR QUERYING
-- Critical for match-specific event timelines and global stats.
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON public.match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON public.match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_club_id ON public.match_events(club_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON public.match_events(event_type);

-- 3. RLS POLICIES FOR MATCH_EVENTS
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read match events" ON public.match_events;
CREATE POLICY "Public can read match events" ON public.match_events
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage match events" ON public.match_events;
CREATE POLICY "Admins can manage match events" ON public.match_events
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. CLEANUP OLD JSONB COLUMN
-- WARNING: This is a destructive operation. In a production environment, 
-- we would migration data first before dropping. For this hardening phase, 
-- we assume a clean break as we're restructuring core architecture.
-- ALTER TABLE public.matches DROP COLUMN IF EXISTS events;

COMMIT;
