BEGIN;

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by_club_id TEXT NULL REFERENCES public.clubs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS linked_official_tournament_id UUID NULL REFERENCES public.tournaments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS review_notes TEXT NULL;

UPDATE public.tournaments
SET review_status = 'approved'
WHERE review_status IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tournaments_review_status_check'
          AND conrelid = 'public.tournaments'::regclass
    ) THEN
        ALTER TABLE public.tournaments
            ADD CONSTRAINT tournaments_review_status_check
            CHECK (review_status IN ('approved', 'pending_link', 'linked', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournaments_review_status
    ON public.tournaments (review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tournaments_created_by_club_review
    ON public.tournaments (created_by_club_id, review_status, created_at DESC)
    WHERE created_by_club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_created_by_user_review
    ON public.tournaments (created_by_user_id, review_status, created_at DESC)
    WHERE created_by_user_id IS NOT NULL;

DROP POLICY IF EXISTS "club_creator_read_pending_tournaments" ON public.tournaments;
CREATE POLICY "club_creator_read_pending_tournaments"
ON public.tournaments
FOR SELECT
TO authenticated
USING (
    review_status = 'pending_link'
    AND created_by_user_id = auth.uid()
);

COMMENT ON COLUMN public.tournaments.review_status IS
    'Moderation state for tournaments created outside the official catalog. pending_link rows are hidden publicly until reviewed.';
COMMENT ON COLUMN public.tournaments.created_by_user_id IS
    'Club Admin user who created the pending tournament.';
COMMENT ON COLUMN public.tournaments.created_by_club_id IS
    'Club context that owns the pending tournament while it is under review.';
COMMENT ON COLUMN public.tournaments.linked_official_tournament_id IS
    'Official tournament used when a pending Club Admin tournament is reconciled instead of published as a new public tournament.';

NOTIFY pgrst, 'reload schema';

COMMIT;
