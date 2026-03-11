-- ============================================
-- TOURNAMENT RELATIONS
-- Explicit tournament-to-tournament relationship model
-- ============================================

CREATE TABLE IF NOT EXISTS public.tournament_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    target_tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (
        relation_type IN (
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
    relation_direction TEXT CHECK (
        relation_direction IN (
            'upward',
            'downward',
            'bidirectional',
            'outgoing',
            'incoming',
            'reference'
        )
    ),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tournament_relations_distinct_tournaments CHECK (source_tournament_id <> target_tournament_id)
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

ALTER TABLE public.tournament_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_tournament_relations"
    ON public.tournament_relations
    FOR SELECT
    USING (true);

CREATE POLICY "admin_manage_tournament_relations"
    ON public.tournament_relations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.users
            WHERE id = auth.uid()
              AND role IN ('super_admin', 'admin_general', 'admin')
        )
    );

COMMENT ON TABLE public.tournament_relations IS 'Competitive or structural links between tournaments.';
COMMENT ON COLUMN public.tournament_relations.relation_type IS 'Type of cross-tournament relationship.';
COMMENT ON COLUMN public.tournament_relations.relation_direction IS 'Optional direction marker for promotion, qualification or hierarchy.';
