BEGIN;

CREATE TABLE IF NOT EXISTS public.club_rivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    official_club_id TEXT REFERENCES public.clubs(id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_rivals_club_normalized_name
    ON public.club_rivals (club_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_club_rivals_club_status
    ON public.club_rivals (club_id, review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_rivals_created_by_user
    ON public.club_rivals (created_by_user_id, review_status, created_at DESC)
    WHERE created_by_user_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'club_rivals_review_status_check'
          AND conrelid = 'public.club_rivals'::regclass
    ) THEN
        ALTER TABLE public.club_rivals
            ADD CONSTRAINT club_rivals_review_status_check
            CHECK (review_status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

DROP POLICY IF EXISTS "club_rivals_select_members" ON public.club_rivals;
CREATE POLICY "club_rivals_select_members"
ON public.club_rivals
FOR SELECT
TO authenticated
USING (
    public.has_membership_scope('club', club_id)
    OR created_by_user_id = auth.uid()
    OR public.is_global_admin()
);

DROP POLICY IF EXISTS "club_rivals_insert_members" ON public.club_rivals;
CREATE POLICY "club_rivals_insert_members"
ON public.club_rivals
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_membership_scope('club', club_id)
    OR public.is_global_admin()
);

COMMENT ON TABLE public.club_rivals IS
    'Rivales/oponentes creados por clubs desde el panel de administración. Permiten reutilizar nombres de rivales en partidos internos y mantener un listado pendiente de revisión por super admin.';

NOTIFY pgrst, 'reload schema';

COMMIT;
