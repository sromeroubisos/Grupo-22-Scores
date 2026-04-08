-- Restores the people table needed by club roster management after the MVP schema simplification.
-- The 20260318100000 simplification migration dropped public.people, but the club management
-- layer uses it as the canonical person registry for players and staff.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    full_name TEXT,
    name TEXT,
    id_number TEXT,
    birth_date DATE,
    gender TEXT,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    photo_url TEXT,
    weight NUMERIC,
    height NUMERIC,
    position TEXT,
    role TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.people
    ADD COLUMN IF NOT EXISTS club_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS id_number TEXT,
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS weight NUMERIC,
    ADD COLUMN IF NOT EXISTS height NUMERIC,
    ADD COLUMN IF NOT EXISTS position TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.people
SET
    full_name = COALESCE(NULLIF(full_name, ''), trim(concat_ws(' ', first_name, last_name))),
    name = COALESCE(NULLIF(name, ''), NULLIF(full_name, ''), trim(concat_ws(' ', first_name, last_name))),
    status = COALESCE(NULLIF(status, ''), 'active'),
    source = COALESCE(NULLIF(source, ''), 'manual')
WHERE full_name IS NULL
   OR full_name = ''
   OR name IS NULL
   OR name = ''
   OR status IS NULL
   OR status = ''
   OR source IS NULL
   OR source = '';

DO $$
BEGIN
    IF to_regclass('public.clubs') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'people_club_id_fkey'
       ) THEN
        ALTER TABLE public.people
            ADD CONSTRAINT people_club_id_fkey
            FOREIGN KEY (club_id)
            REFERENCES public.clubs(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.team_memberships') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'team_memberships_person_id_fkey'
       ) THEN
        ALTER TABLE public.team_memberships
            ADD CONSTRAINT team_memberships_person_id_fkey
            FOREIGN KEY (person_id)
            REFERENCES public.people(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS people_club_id_idx ON public.people (club_id);
CREATE INDEX IF NOT EXISTS people_full_name_idx ON public.people (full_name);
CREATE INDEX IF NOT EXISTS people_role_idx ON public.people (role);
CREATE INDEX IF NOT EXISTS people_status_idx ON public.people (status);

DO $$
BEGIN
    IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS people_updated_at ON public.people;
        CREATE TRIGGER people_updated_at
            BEFORE UPDATE ON public.people
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "people_public_read" ON public.people;
CREATE POLICY "people_public_read" ON public.people
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "people_admin_manage" ON public.people;
DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        CREATE POLICY "people_admin_manage" ON public.people
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin());
    ELSE
        CREATE POLICY "people_admin_manage" ON public.people
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

COMMENT ON TABLE public.people IS 'Canonical person registry for club rosters, staff, and public roster display.';
