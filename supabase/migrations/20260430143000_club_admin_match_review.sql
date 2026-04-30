BEGIN;

-- Club admins can create matches, but those rows must remain private until
-- a Super Admin reviews them.
ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by_club_id TEXT NULL REFERENCES public.clubs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS review_notes TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_review_status_check'
          AND conrelid = 'public.matches'::regclass
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_review_status_check
            CHECK (review_status IN ('approved', 'pending', 'rejected'));
    END IF;
END $$;

UPDATE public.matches
SET
    is_visible = COALESCE(is_visible, TRUE),
    review_status = COALESCE(review_status, 'approved')
WHERE is_visible IS NULL
   OR review_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_review_status
    ON public.matches (review_status, is_visible, date_time DESC);

CREATE INDEX IF NOT EXISTS idx_matches_created_by_club
    ON public.matches (created_by_club_id, date_time DESC)
    WHERE created_by_club_id IS NOT NULL;

DROP POLICY IF EXISTS "Public Read Matches" ON public.matches;
DROP POLICY IF EXISTS "public_read_matches" ON public.matches;
DROP POLICY IF EXISTS "public_read_all" ON public.matches;
DROP POLICY IF EXISTS "matches_select" ON public.matches;
DROP POLICY IF EXISTS "matches_select_public" ON public.matches;
DROP POLICY IF EXISTS "matches_select_manage" ON public.matches;

CREATE POLICY matches_select_public
    ON public.matches
    FOR SELECT
    TO anon, authenticated
    USING (
        COALESCE(is_visible, TRUE) = TRUE
        AND COALESCE(review_status, 'approved') = 'approved'
    );

CREATE POLICY matches_select_manage
    ON public.matches
    FOR SELECT
    TO authenticated
    USING (
        public.is_global_admin()
        OR created_by_user_id = auth.uid()
        OR (
            created_by_club_id IS NOT NULL
            AND public.can_manage_club(
                created_by_club_id,
                ARRAY['admin', 'editor', 'operator', 'viewer']
            )
        )
        OR public.can_manage_match_row(
            id::text,
            tournament_id::text,
            COALESCE(sport_id::text, sport::text),
            ARRAY['admin', 'editor', 'operator']
        )
    );

COMMENT ON COLUMN public.matches.is_visible IS 'Public feed visibility for manually-created matches.';
COMMENT ON COLUMN public.matches.review_status IS 'Super Admin review state for club-admin-created matches.';
COMMENT ON COLUMN public.matches.created_by_user_id IS 'User who created the match from an admin surface.';
COMMENT ON COLUMN public.matches.created_by_club_id IS 'Club scope that created the match from Club Admin.';
COMMENT ON COLUMN public.matches.reviewed_by_user_id IS 'Super Admin who approved or rejected the match.';
COMMENT ON COLUMN public.matches.reviewed_at IS 'Timestamp when the match was approved or rejected.';
COMMENT ON COLUMN public.matches.review_notes IS 'Internal notes for the match review decision.';

NOTIFY pgrst, 'reload schema';

COMMIT;
