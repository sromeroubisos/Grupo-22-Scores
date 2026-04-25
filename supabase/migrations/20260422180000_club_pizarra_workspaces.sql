BEGIN;

CREATE TABLE IF NOT EXISTS public.club_pizarra_workspaces (
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    sport TEXT NOT NULL DEFAULT 'rugby',
    board_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    saved_presets JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, sport),
    CONSTRAINT club_pizarra_workspaces_board_state_check CHECK (jsonb_typeof(board_state) = 'object'),
    CONSTRAINT club_pizarra_workspaces_saved_presets_check CHECK (jsonb_typeof(saved_presets) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_club_pizarra_workspaces_club_id
    ON public.club_pizarra_workspaces (club_id, updated_at DESC);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_pizarra_workspaces_set_updated_at ON public.club_pizarra_workspaces';
        EXECUTE 'CREATE TRIGGER club_pizarra_workspaces_set_updated_at
            BEFORE UPDATE ON public.club_pizarra_workspaces
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_pizarra_workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_pizarra_workspaces_select ON public.club_pizarra_workspaces;
CREATE POLICY club_pizarra_workspaces_select
    ON public.club_pizarra_workspaces
    FOR SELECT
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_pizarra_workspaces.club_id, ARRAY['admin', 'editor', 'operator', 'viewer'])
    );

DROP POLICY IF EXISTS club_pizarra_workspaces_insert ON public.club_pizarra_workspaces;
CREATE POLICY club_pizarra_workspaces_insert
    ON public.club_pizarra_workspaces
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_pizarra_workspaces.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_pizarra_workspaces_update ON public.club_pizarra_workspaces;
CREATE POLICY club_pizarra_workspaces_update
    ON public.club_pizarra_workspaces
    FOR UPDATE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_pizarra_workspaces.club_id, ARRAY['admin', 'editor'])
    )
    WITH CHECK (
        public.authorize_admin()
        OR public.can_manage_club(public.club_pizarra_workspaces.club_id, ARRAY['admin', 'editor'])
    );

DROP POLICY IF EXISTS club_pizarra_workspaces_delete ON public.club_pizarra_workspaces;
CREATE POLICY club_pizarra_workspaces_delete
    ON public.club_pizarra_workspaces
    FOR DELETE
    TO authenticated
    USING (
        public.authorize_admin()
        OR public.can_manage_club(public.club_pizarra_workspaces.club_id, ARRAY['admin', 'editor'])
    );

COMMENT ON TABLE public.club_pizarra_workspaces IS 'Biblioteca privada de pizarra tactica por club y deporte.';
COMMENT ON COLUMN public.club_pizarra_workspaces.board_state IS 'Ultimo workspace completo guardado por el club.';
COMMENT ON COLUMN public.club_pizarra_workspaces.saved_presets IS 'Snapshots nombrados que guardan tablero, animacion y configuracion.';

COMMIT;
