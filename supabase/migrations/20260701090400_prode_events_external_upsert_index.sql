-- Support for B13 audit fix (prode_events race on external inserts).
-- prodePlay.ts now upserts with onConflict 'competition_id,external_provider,external_match_id'.
-- The existing idx_prode_events_unique_external (20260408170000) is a PARTIAL unique
-- index (WHERE external_match_id IS NOT NULL) and PostgREST cannot infer partial
-- indexes for ON CONFLICT, so a full (non-partial) unique index is required.
-- It is semantically equivalent: rows with NULL external_match_id / external_provider
-- never conflict (NULLs are distinct), so local events are unaffected.

DO $$
BEGIN
    IF to_regclass('public.prode_events') IS NULL THEN
        RAISE NOTICE 'prode_events no existe; se omite prode_events_competition_external_unique.';
    ELSIF EXISTS (
        SELECT 1
        FROM public.prode_events
        WHERE external_match_id IS NOT NULL
        GROUP BY competition_id, external_provider, external_match_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'prode_events tiene eventos externos duplicados; no se crea prode_events_competition_external_unique. Depurar duplicados y re-ejecutar.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS prode_events_competition_external_unique
            ON public.prode_events (competition_id, external_provider, external_match_id);
    END IF;
END $$;
