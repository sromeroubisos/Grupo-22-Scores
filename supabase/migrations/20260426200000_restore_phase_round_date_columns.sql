-- Restore start_date / end_date columns on tournament_phases and
-- tournament_rounds. These columns were defined in the original
-- 20260224100000_tournament_management_tables / 20260225000000_add_tournament_rounds
-- migrations, but some environments lost them during the schema simplification
-- pass and the historical season importer needs to write into them.
--
-- This migration is idempotent and safe to run multiple times.

BEGIN;

ALTER TABLE public.tournament_phases
    ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tournament_rounds
    ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMIT;

-- Force PostgREST to refresh its schema cache so the new columns become
-- visible to the REST API immediately after the migration runs.
NOTIFY pgrst, 'reload schema';
