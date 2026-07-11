-- B3 audit fix: guarantee uniqueness of tournaments.external_id.
-- Sync jobs match tournaments by external_id; without a unique constraint,
-- concurrent syncs can create duplicated tournaments for the same provider id.
-- Defensive: if pre-existing duplicates would break the index, skip creation
-- with a NOTICE instead of failing the deploy.

DO $$
BEGIN
    IF to_regclass('public.tournaments') IS NULL THEN
        RAISE NOTICE 'tournaments no existe; se omite tournaments_external_id_unique.';
    ELSIF EXISTS (
        SELECT 1
        FROM public.tournaments
        WHERE external_id IS NOT NULL
        GROUP BY external_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'tournaments tiene external_id duplicados; no se crea tournaments_external_id_unique. Depurar duplicados y re-ejecutar.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS tournaments_external_id_unique
            ON public.tournaments (external_id)
            WHERE external_id IS NOT NULL;
    END IF;
END $$;
