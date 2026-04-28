BEGIN;

CREATE TABLE IF NOT EXISTS public.club_rugby_performance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    scope TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT 'training',
    match_id UUID NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    training_id UUID NULL REFERENCES public.club_trainings(id) ON DELETE SET NULL,
    player_id UUID NULL REFERENCES public.people(id) ON DELETE SET NULL,
    player_name TEXT NULL,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_rugby_performance_records_scope_check CHECK (scope IN ('match_global', 'club_private')),
    CONSTRAINT club_rugby_performance_records_context_check CHECK (context IN ('match', 'training', 'gym', 'review')),
    CONSTRAINT club_rugby_performance_records_payload_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_club_rugby_performance_records_club_module_date
    ON public.club_rugby_performance_records (club_id, module_key, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_club_rugby_performance_records_match
    ON public.club_rugby_performance_records (match_id, module_key)
    WHERE match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_club_rugby_performance_records_player
    ON public.club_rugby_performance_records (club_id, player_id, event_date DESC)
    WHERE player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rugby_match_event_taxonomy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key TEXT NOT NULL,
    event_key TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    scope TEXT NOT NULL DEFAULT 'match_global',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rugby_match_event_taxonomy_scope_check CHECK (scope = 'match_global'),
    CONSTRAINT rugby_match_event_taxonomy_config_check CHECK (jsonb_typeof(config) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rugby_match_event_taxonomy_module_event
    ON public.rugby_match_event_taxonomy (module_key, event_key);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_rugby_performance_records_set_updated_at ON public.club_rugby_performance_records';
        EXECUTE 'CREATE TRIGGER club_rugby_performance_records_set_updated_at
            BEFORE UPDATE ON public.club_rugby_performance_records
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';

        EXECUTE 'DROP TRIGGER IF EXISTS rugby_match_event_taxonomy_set_updated_at ON public.rugby_match_event_taxonomy';
        EXECUTE 'CREATE TRIGGER rugby_match_event_taxonomy_set_updated_at
            BEFORE UPDATE ON public.rugby_match_event_taxonomy
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_rugby_performance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rugby_match_event_taxonomy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_rugby_performance_records_select ON public.club_rugby_performance_records;
CREATE POLICY club_rugby_performance_records_select
    ON public.club_rugby_performance_records
    FOR SELECT
    TO authenticated
    USING (
        (public.authorize_admin() AND public.club_rugby_performance_records.scope = 'match_global')
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type IN ('club', 'club_family')
              AND m.scope_id::text = public.club_rugby_performance_records.club_id::text
              AND m.role = ANY (ARRAY['admin', 'editor', 'operator', 'viewer'])
        )
    );

DROP POLICY IF EXISTS club_rugby_performance_records_insert ON public.club_rugby_performance_records;
CREATE POLICY club_rugby_performance_records_insert
    ON public.club_rugby_performance_records
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.authorize_admin() AND public.club_rugby_performance_records.scope = 'match_global')
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type IN ('club', 'club_family')
              AND m.scope_id::text = public.club_rugby_performance_records.club_id::text
              AND m.role = ANY (ARRAY['admin', 'editor', 'operator'])
        )
    );

DROP POLICY IF EXISTS club_rugby_performance_records_update ON public.club_rugby_performance_records;
CREATE POLICY club_rugby_performance_records_update
    ON public.club_rugby_performance_records
    FOR UPDATE
    TO authenticated
    USING (
        (public.authorize_admin() AND public.club_rugby_performance_records.scope = 'match_global')
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type IN ('club', 'club_family')
              AND m.scope_id::text = public.club_rugby_performance_records.club_id::text
              AND m.role = ANY (ARRAY['admin', 'editor', 'operator'])
        )
    )
    WITH CHECK (
        (public.authorize_admin() AND public.club_rugby_performance_records.scope = 'match_global')
        OR EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type IN ('club', 'club_family')
              AND m.scope_id::text = public.club_rugby_performance_records.club_id::text
              AND m.role = ANY (ARRAY['admin', 'editor', 'operator'])
        )
    );

DROP POLICY IF EXISTS club_rugby_performance_records_delete ON public.club_rugby_performance_records;
CREATE POLICY club_rugby_performance_records_delete
    ON public.club_rugby_performance_records
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.scope_type IN ('club', 'club_family')
              AND m.scope_id::text = public.club_rugby_performance_records.club_id::text
              AND m.role = ANY (ARRAY['admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS rugby_match_event_taxonomy_select ON public.rugby_match_event_taxonomy;
CREATE POLICY rugby_match_event_taxonomy_select
    ON public.rugby_match_event_taxonomy
    FOR SELECT
    TO authenticated
    USING (public.authorize_admin());

DROP POLICY IF EXISTS rugby_match_event_taxonomy_write ON public.rugby_match_event_taxonomy;
CREATE POLICY rugby_match_event_taxonomy_write
    ON public.rugby_match_event_taxonomy
    FOR ALL
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

COMMENT ON TABLE public.club_rugby_performance_records IS 'Registros avanzados de rendimiento rugby: eventos globales de partido y datos privados de club.';
COMMENT ON COLUMN public.club_rugby_performance_records.scope IS 'match_global queda disponible para superadmin y club admin; club_private queda reservado a memberships del club.';
COMMENT ON TABLE public.rugby_match_event_taxonomy IS 'Catalogo configurable por superadmin de eventos estadisticos de partido rugby.';

COMMIT;
