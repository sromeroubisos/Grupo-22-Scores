BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES public.tournament_phases(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'unknown',
    confidence_level TEXT NOT NULL DEFAULT 'baja',
    status TEXT NOT NULL DEFAULT 'preview',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    preview_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.import_jobs
    ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.tournament_phases(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS confidence_level TEXT NOT NULL DEFAULT 'baja',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'preview',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS preview_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS result_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.import_jobs
    ALTER COLUMN document_type SET DEFAULT 'unknown',
    ALTER COLUMN confidence_level SET DEFAULT 'baja',
    ALTER COLUMN status SET DEFAULT 'preview',
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
    ALTER COLUMN preview_stats SET DEFAULT '{}'::jsonb,
    ALTER COLUMN result_stats SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.import_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    extension TEXT,
    file_size BIGINT,
    file_hash TEXT,
    extracted_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.import_files
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS original_name TEXT,
    ADD COLUMN IF NOT EXISTS mime_type TEXT,
    ADD COLUMN IF NOT EXISTS extension TEXT,
    ADD COLUMN IF NOT EXISTS file_size BIGINT,
    ADD COLUMN IF NOT EXISTS file_hash TEXT,
    ADD COLUMN IF NOT EXISTS extracted_text TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.import_files
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    source_label TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    extracted_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_status TEXT NOT NULL DEFAULT 'warning',
    confidence_level TEXT NOT NULL DEFAULT 'baja',
    issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.import_rows
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS row_index INTEGER,
    ADD COLUMN IF NOT EXISTS source_label TEXT,
    ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS extracted_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'warning',
    ADD COLUMN IF NOT EXISTS confidence_level TEXT NOT NULL DEFAULT 'baja',
    ADD COLUMN IF NOT EXISTS issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.import_rows
    ALTER COLUMN raw_payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN extracted_payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN normalized_payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN validation_status SET DEFAULT 'warning',
    ALTER COLUMN confidence_level SET DEFAULT 'baja',
    ALTER COLUMN issues SET DEFAULT '[]'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.import_match_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    row_id UUID NOT NULL REFERENCES public.import_rows(id) ON DELETE CASCADE,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    duplicate_action TEXT NOT NULL DEFAULT 'skip_row',
    row_status TEXT NOT NULL DEFAULT 'warning',
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    duplicate_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    inserted_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    preview_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.import_match_previews
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS row_id UUID REFERENCES public.import_rows(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS duplicate_action TEXT NOT NULL DEFAULT 'skip_row',
    ADD COLUMN IF NOT EXISTS row_status TEXT NOT NULL DEFAULT 'warning',
    ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duplicate_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS inserted_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preview_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.import_match_previews
    ALTER COLUMN approval_status SET DEFAULT 'pending',
    ALTER COLUMN duplicate_action SET DEFAULT 'skip_row',
    ALTER COLUMN row_status SET DEFAULT 'warning',
    ALTER COLUMN error_count SET DEFAULT 0,
    ALTER COLUMN warning_count SET DEFAULT 0,
    ALTER COLUMN preview_payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN resolution_payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.import_logs
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS event_type TEXT,
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.import_logs
    ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS import_rows_job_row_unique ON public.import_rows(job_id, row_index);
CREATE UNIQUE INDEX IF NOT EXISTS import_match_previews_row_unique ON public.import_match_previews(row_id);
CREATE INDEX IF NOT EXISTS import_jobs_tournament_idx ON public.import_jobs(tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_status_idx ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS import_files_job_idx ON public.import_files(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_rows_job_idx ON public.import_rows(job_id, validation_status);
CREATE INDEX IF NOT EXISTS import_match_previews_job_idx ON public.import_match_previews(job_id, approval_status);
CREATE INDEX IF NOT EXISTS import_match_previews_duplicate_idx ON public.import_match_previews(duplicate_match_id);
CREATE INDEX IF NOT EXISTS import_logs_job_idx ON public.import_logs(job_id, created_at DESC);

DROP TRIGGER IF EXISTS import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER import_jobs_updated_at
    BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS import_rows_updated_at ON public.import_rows;
CREATE TRIGGER import_rows_updated_at
    BEFORE UPDATE ON public.import_rows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS import_match_previews_updated_at ON public.import_match_previews;
CREATE TRIGGER import_match_previews_updated_at
    BEFORE UPDATE ON public.import_match_previews
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_match_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_import_jobs" ON public.import_jobs;
CREATE POLICY "admin_manage_import_jobs" ON public.import_jobs
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')));

DROP POLICY IF EXISTS "admin_manage_import_files" ON public.import_files;
CREATE POLICY "admin_manage_import_files" ON public.import_files
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')));

DROP POLICY IF EXISTS "admin_manage_import_rows" ON public.import_rows;
CREATE POLICY "admin_manage_import_rows" ON public.import_rows
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')));

DROP POLICY IF EXISTS "admin_manage_import_match_previews" ON public.import_match_previews;
CREATE POLICY "admin_manage_import_match_previews" ON public.import_match_previews
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')));

DROP POLICY IF EXISTS "admin_manage_import_logs" ON public.import_logs;
CREATE POLICY "admin_manage_import_logs" ON public.import_logs
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general', 'admin')));

COMMIT;

NOTIFY pgrst, 'reload schema';
