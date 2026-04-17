BEGIN;

-- Restore legacy tournament columns that are still consumed by older routes,
-- RPCs and admin screens. Keep them synchronized with the simplified schema.
ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS original_name TEXT,
    ADD COLUMN IF NOT EXISTS url TEXT,
    ADD COLUMN IF NOT EXISTS display_order INTEGER,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
    ADD COLUMN IF NOT EXISTS sport_name TEXT,
    ADD COLUMN IF NOT EXISTS country_name TEXT;

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS clock JSONB;

CREATE OR REPLACE FUNCTION public.sync_tournament_legacy_compat_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.original_name IS NULL OR btrim(NEW.original_name) = '' THEN
        NEW.original_name := NEW.name;
    END IF;

    IF NEW.display_order IS NULL THEN
        NEW.display_order := NEW.priority;
    END IF;

    NEW.is_active := (
        COALESCE(NEW.status, 'published') IN ('active', 'published')
        AND COALESCE(NEW.is_visible, true)
    );

    IF NEW.sport_id IS NOT NULL AND btrim(NEW.sport_id) <> '' THEN
        SELECT s.name
        INTO NEW.sport_name
        FROM public.sports s
        WHERE s.id = NEW.sport_id;
    ELSE
        NEW.sport_name := NULL;
    END IF;

    IF NEW.country_id IS NOT NULL AND btrim(NEW.country_id) <> '' THEN
        SELECT c.name
        INTO NEW.country_name
        FROM public.countries c
        WHERE c.id = NEW.country_id;
    ELSE
        NEW.country_name := NULLIF(btrim(COALESCE(NEW.country, '')), '');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournaments_sync_legacy_compat_columns ON public.tournaments;
CREATE TRIGGER tournaments_sync_legacy_compat_columns
    BEFORE INSERT OR UPDATE ON public.tournaments
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_tournament_legacy_compat_columns();

UPDATE public.tournaments t
SET
    original_name = COALESCE(NULLIF(btrim(t.original_name), ''), t.name),
    display_order = COALESCE(t.display_order, t.priority),
    is_active = (
        COALESCE(t.status, 'published') IN ('active', 'published')
        AND COALESCE(t.is_visible, true)
    ),
    sport_name = COALESCE(
        (SELECT s.name FROM public.sports s WHERE s.id = t.sport_id),
        t.sport_name
    ),
    country_name = COALESCE(
        (SELECT c.name FROM public.countries c WHERE c.id = t.country_id),
        NULLIF(btrim(COALESCE(t.country, '')), ''),
        t.country_name
    )
WHERE
    t.original_name IS NULL
    OR btrim(t.original_name) = ''
    OR t.display_order IS NULL
    OR t.is_active IS DISTINCT FROM (
        COALESCE(t.status, 'published') IN ('active', 'published')
        AND COALESCE(t.is_visible, true)
    )
    OR t.sport_name IS NULL
    OR t.country_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_is_active ON public.tournaments (is_active);
CREATE INDEX IF NOT EXISTS idx_tournaments_display_order ON public.tournaments (display_order);

-- Recreate the follower table because several RPCs and diagnostics still rely on it.
CREATE TABLE IF NOT EXISTS public.tournament_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tournament_followers_user_id_tournament_id_key'
          AND conrelid = 'public.tournament_followers'::regclass
    ) THEN
        ALTER TABLE public.tournament_followers
            ADD CONSTRAINT tournament_followers_user_id_tournament_id_key
            UNIQUE (user_id, tournament_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_followers_user_id
    ON public.tournament_followers (user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_followers_tournament_id
    ON public.tournament_followers (tournament_id);

ALTER TABLE public.tournament_followers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Public can view follower stats" ON public.tournament_followers;
    DROP POLICY IF EXISTS "Users manage own follows" ON public.tournament_followers;
    DROP POLICY IF EXISTS tournament_followers_select ON public.tournament_followers;
    DROP POLICY IF EXISTS tournament_followers_insert ON public.tournament_followers;
    DROP POLICY IF EXISTS tournament_followers_update ON public.tournament_followers;
    DROP POLICY IF EXISTS tournament_followers_delete ON public.tournament_followers;
END $$;

CREATE POLICY tournament_followers_select
    ON public.tournament_followers
    FOR SELECT
    USING (true);

CREATE POLICY tournament_followers_insert
    ON public.tournament_followers
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY tournament_followers_update
    ON public.tournament_followers
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY tournament_followers_delete
    ON public.tournament_followers
    FOR DELETE
    USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
