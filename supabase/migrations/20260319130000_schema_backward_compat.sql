-- ============================================================
-- SCHEMA BACKWARD COMPATIBILITY
-- Purpose: restore legacy columns still referenced by older queries
-- while keeping sport_id / is_visible as canonical fields.
-- ============================================================

BEGIN;

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS visibility TEXT;

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS sport TEXT;

UPDATE public.clubs
SET visibility = CASE
    WHEN COALESCE(is_visible, true) THEN 'visible'
    ELSE 'hidden'
END
WHERE visibility IS DISTINCT FROM CASE
    WHEN COALESCE(is_visible, true) THEN 'visible'
    ELSE 'hidden'
END;

UPDATE public.tournaments
SET sport = sport_id
WHERE sport IS DISTINCT FROM sport_id;

CREATE OR REPLACE FUNCTION public.sync_clubs_visibility_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_visible IS NULL AND NEW.visibility IS NOT NULL THEN
            NEW.is_visible := NEW.visibility = 'visible';
        ELSE
            NEW.visibility := CASE WHEN COALESCE(NEW.is_visible, true) THEN 'visible' ELSE 'hidden' END;
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.visibility IS DISTINCT FROM OLD.visibility
       AND NOT (NEW.is_visible IS DISTINCT FROM OLD.is_visible) THEN
        NEW.is_visible := COALESCE(NEW.visibility, 'visible') = 'visible';
    ELSE
        NEW.visibility := CASE WHEN COALESCE(NEW.is_visible, true) THEN 'visible' ELSE 'hidden' END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_clubs_visibility_compat ON public.clubs;
CREATE TRIGGER trg_sync_clubs_visibility_compat
BEFORE INSERT OR UPDATE ON public.clubs
FOR EACH ROW
EXECUTE FUNCTION public.sync_clubs_visibility_compat();

CREATE OR REPLACE FUNCTION public.sync_tournaments_sport_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.sport_id IS NULL AND NEW.sport IS NOT NULL THEN
            NEW.sport_id := NEW.sport;
        ELSE
            NEW.sport := NEW.sport_id;
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.sport IS DISTINCT FROM OLD.sport
       AND NOT (NEW.sport_id IS DISTINCT FROM OLD.sport_id) THEN
        NEW.sport_id := NEW.sport;
    ELSE
        NEW.sport := NEW.sport_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tournaments_sport_compat ON public.tournaments;
CREATE TRIGGER trg_sync_tournaments_sport_compat
BEFORE INSERT OR UPDATE ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.sync_tournaments_sport_compat();

COMMIT;

NOTIFY pgrst, 'reload schema';
