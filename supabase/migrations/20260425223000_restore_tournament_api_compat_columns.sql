-- Restore API-origin compatibility columns still selected by deployed routes/RPCs.
-- The simplified schema treats these as optional metadata, but keeping the columns
-- avoids PostgREST 500s while older clients and cached schema settle.

BEGIN;

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS is_api_managed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS data_source TEXT,
    ADD COLUMN IF NOT EXISTS external_id TEXT;

UPDATE public.tournaments
SET is_api_managed = false
WHERE is_api_managed IS NULL;

COMMENT ON COLUMN public.tournaments.is_api_managed IS
    'Compatibility flag for routes/RPCs that still distinguish imported/API tournaments.';

COMMENT ON COLUMN public.tournaments.data_source IS
    'Optional compatibility metadata for imported/API tournaments.';

COMMENT ON COLUMN public.tournaments.external_id IS
    'Optional compatibility metadata for the upstream tournament identifier.';

NOTIFY pgrst, 'reload schema';

COMMIT;
