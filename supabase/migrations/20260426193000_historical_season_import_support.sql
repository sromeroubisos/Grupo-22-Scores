-- Restore the metadata tables used by the historical season importer.
-- They were introduced before the schema simplification pass, then some
-- environments dropped them as optional modules.

BEGIN;

CREATE TABLE IF NOT EXISTS public.seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id TEXT NOT NULL,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    teams_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.seasons
    ADD COLUMN IF NOT EXISTS season_id TEXT,
    ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS teams_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS seasons_unique_tournament_season
    ON public.seasons(season_id, tournament_id);

CREATE INDEX IF NOT EXISTS seasons_tournament_idx
    ON public.seasons(tournament_id);

CREATE TABLE IF NOT EXISTS public.tournament_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    target_tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    relation_direction TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tournament_relations_distinct_tournaments CHECK (source_tournament_id <> target_tournament_id)
);

ALTER TABLE public.tournament_relations
    ADD COLUMN IF NOT EXISTS source_tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS target_tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS relation_type TEXT,
    ADD COLUMN IF NOT EXISTS relation_direction TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.tournament_relations
    DROP CONSTRAINT IF EXISTS tournament_relations_relation_type_check,
    DROP CONSTRAINT IF EXISTS tournament_relations_relation_direction_check,
    DROP CONSTRAINT IF EXISTS tournament_relations_status_check,
    DROP CONSTRAINT IF EXISTS tournament_relations_distinct_tournaments;

ALTER TABLE public.tournament_relations
    ADD CONSTRAINT tournament_relations_relation_type_check CHECK (
        relation_type IN (
            'previous_season',
            'next_season',
            'international_tournament',
            'promotion_relegation',
            'qualification',
            'previous_stage',
            'next_stage',
            'feeder_tournament',
            'parent_competition',
            'child_competition',
            'parallel_competition',
            'regional_pathway'
        )
    ),
    ADD CONSTRAINT tournament_relations_relation_direction_check CHECK (
        relation_direction IS NULL OR relation_direction IN (
            'upward',
            'downward',
            'bidirectional',
            'outgoing',
            'incoming',
            'reference'
        )
    ),
    ADD CONSTRAINT tournament_relations_status_check CHECK (
        status IN ('active', 'inactive', 'draft', 'archived')
    ),
    ADD CONSTRAINT tournament_relations_distinct_tournaments CHECK (
        source_tournament_id <> target_tournament_id
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_relations_unique_active
    ON public.tournament_relations(source_tournament_id, target_tournament_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_tournament_relations_source
    ON public.tournament_relations(source_tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_tournament_relations_target
    ON public.tournament_relations(target_tournament_id, status);

CREATE OR REPLACE FUNCTION public.update_tournament_relations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_tournament_relations_updated_at
    ON public.tournament_relations;

CREATE TRIGGER trigger_update_tournament_relations_updated_at
    BEFORE UPDATE ON public.tournament_relations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_tournament_relations_updated_at();

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seasons_public_read ON public.seasons;
DROP POLICY IF EXISTS seasons_admin_manage ON public.seasons;
DROP POLICY IF EXISTS public_read_tournament_relations ON public.tournament_relations;
DROP POLICY IF EXISTS admin_manage_tournament_relations ON public.tournament_relations;

CREATE POLICY seasons_public_read
    ON public.seasons
    FOR SELECT
    USING (true);

CREATE POLICY seasons_admin_manage
    ON public.seasons
    FOR ALL
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

CREATE POLICY public_read_tournament_relations
    ON public.tournament_relations
    FOR SELECT
    USING (true);

CREATE POLICY admin_manage_tournament_relations
    ON public.tournament_relations
    FOR ALL
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';
