CREATE TABLE IF NOT EXISTS public.club_family_divisions (
    family_base_club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    roster_owner_club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    division_club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    group_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_family_divisions_pk PRIMARY KEY (family_base_club_id, division_club_id),
    CONSTRAINT club_family_divisions_distinct CHECK (roster_owner_club_id <> division_club_id)
);

ALTER TABLE public.club_family_divisions
    ADD COLUMN IF NOT EXISTS group_name TEXT;

CREATE INDEX IF NOT EXISTS idx_club_family_divisions_owner
    ON public.club_family_divisions (roster_owner_club_id);

CREATE INDEX IF NOT EXISTS idx_club_family_divisions_division
    ON public.club_family_divisions (division_club_id);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_family_divisions_updated_at ON public.club_family_divisions';
        EXECUTE 'CREATE TRIGGER club_family_divisions_updated_at
            BEFORE UPDATE ON public.club_family_divisions
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_family_divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_family_divisions_public_read" ON public.club_family_divisions;
CREATE POLICY "club_family_divisions_public_read" ON public.club_family_divisions
    FOR SELECT
    USING (TRUE);

DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "club_family_divisions_admin_manage" ON public.club_family_divisions';
        EXECUTE 'CREATE POLICY "club_family_divisions_admin_manage" ON public.club_family_divisions
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';
    END IF;
END $$;

COMMENT ON TABLE public.club_family_divisions IS
    'Defines roster-sharing groups inside a club family. A family can have several independent shared-roster division groups.';

COMMENT ON COLUMN public.club_family_divisions.family_base_club_id IS
    'Root club of the operational family.';

COMMENT ON COLUMN public.club_family_divisions.roster_owner_club_id IS
    'Club whose roster is used as the source of truth for the division group.';

COMMENT ON COLUMN public.club_family_divisions.division_club_id IS
    'Club that shares the roster owned by roster_owner_club_id.';

COMMENT ON COLUMN public.club_family_divisions.group_name IS
    'Human-readable name for the roster-sharing group, for example M16 or Plantel Superior.';
