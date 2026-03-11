-- ============================================
-- ENHANCEMENT: Tournament Participants
-- Adds notes field, improves indexing, prepares for audit trail
-- ============================================

-- Add notes column to tournament_participants (if not exists)
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS country_name TEXT;

-- Update status enum to include all states
DO $$ BEGIN
    ALTER TABLE public.tournament_participants
        DROP CONSTRAINT IF EXISTS tournament_participants_status_check;
    ALTER TABLE public.tournament_participants
        ADD CONSTRAINT tournament_participants_status_check
        CHECK (status IN ('active', 'inactive', 'pending', 'disqualified', 'withdrawn'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Ensure club_id can be nullable (for manual participants not linked to a club)
ALTER TABLE public.tournament_participants
    ALTER COLUMN club_id DROP NOT NULL;

-- Add name column if it doesn't exist (to support manual entries)
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS name TEXT;

-- Add type column for participant classification
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('club', 'national_team', 'franchise', 'invited', 'individual')) DEFAULT 'club';

-- Add short_code column if missing
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Ensure created_at and updated_at exist
ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tournament_participants_status
    ON public.tournament_participants(tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_type
    ON public.tournament_participants(tournament_id, type);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_group
    ON public.tournament_participants(tournament_id, group_id)
    WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_seed
    ON public.tournament_participants(tournament_id, seed)
    WHERE seed IS NOT NULL;

-- Create text search index for name and short_code
CREATE INDEX IF NOT EXISTS idx_tournament_participants_search
    ON public.tournament_participants
    USING gin(to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(short_code, '')));

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_tournament_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tournament_participants_updated_at
    ON public.tournament_participants;

CREATE TRIGGER trigger_update_tournament_participants_updated_at
    BEFORE UPDATE ON public.tournament_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_tournament_participants_updated_at();

-- ============================================
-- AUDIT TRAIL (Optional - for history tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS public.tournament_participants_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'status_changed')),
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changes JSONB DEFAULT '{}'::jsonb, -- stores before/after values
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participants_audit_participant
    ON public.tournament_participants_audit(participant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_participants_audit_tournament
    ON public.tournament_participants_audit(tournament_id, created_at DESC);

-- Enable RLS for audit table
ALTER TABLE public.tournament_participants_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_participants_audit"
    ON public.tournament_participants_audit
    FOR SELECT
    USING (true);

CREATE POLICY "admin_manage_participants_audit"
    ON public.tournament_participants_audit
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin_general', 'admin')
        )
    );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get participant statistics for a tournament
CREATE OR REPLACE FUNCTION public.get_tournament_participant_stats(p_tournament_id UUID)
RETURNS TABLE(
    total BIGINT,
    active BIGINT,
    inactive BIGINT,
    pending BIGINT,
    disqualified BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'disqualified') as disqualified
    FROM public.tournament_participants
    WHERE tournament_id = p_tournament_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check for duplicate participants
CREATE OR REPLACE FUNCTION public.check_duplicate_participant(
    p_tournament_id UUID,
    p_club_id TEXT,
    p_name TEXT,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.tournament_participants
    WHERE tournament_id = p_tournament_id
      AND (
          (club_id IS NOT NULL AND club_id = p_club_id)
          OR (LOWER(name) = LOWER(p_name))
      )
      AND (p_exclude_id IS NULL OR id != p_exclude_id);

    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE public.tournament_participants IS 'Teams or individuals participating in a tournament. Supports both DB-linked clubs and manual entries.';
COMMENT ON COLUMN public.tournament_participants.notes IS 'Additional notes about this participant (injuries, special considerations, etc.)';
COMMENT ON COLUMN public.tournament_participants.type IS 'Type of participant: club, national_team, franchise, invited, or individual';
COMMENT ON COLUMN public.tournament_participants.status IS 'Current status: active, inactive, pending, disqualified, or withdrawn';
