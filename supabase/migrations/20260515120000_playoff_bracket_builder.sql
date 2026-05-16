-- ════════════════════════════════════════════════════════════════════════
-- Playoff Bracket Builder
-- Multi-cup playoff brackets with automatic winner/loser advancement.
--
-- A "Copa" (Oro / Plata / Bronce / Estímulo …) is modelled as a
-- tournament_groups row scoped to the playoff phase. Rounds become
-- cup-aware via tournament_rounds.group_id. Matches gain a stable bracket
-- code + human placeholder labels so the bracket can render
-- "Ganador Partido 1 vs Ganador Partido 2" before results exist.
--
-- This migration is purely additive (new nullable column, new columns,
-- new table) so it is safe to apply on top of the existing schema.
-- ════════════════════════════════════════════════════════════════════════

-- ─── ROUNDS BECOME CUP-AWARE ────────────────────────────────────────────
-- group_id NULL  -> phase-wide round (e.g. the shared "Octavos" qualifier)
-- group_id SET   -> round that belongs to a specific cup (Oro/Plata/…)
ALTER TABLE public.tournament_rounds
    ADD COLUMN IF NOT EXISTS group_id UUID
        REFERENCES public.tournament_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_group
    ON public.tournament_rounds(group_id);

-- ─── MATCH BRACKET METADATA ─────────────────────────────────────────────
ALTER TABLE public.matches
    -- Stable id of the match within the generated bracket (e.g. "OCT-3",
    -- "ORO-SF-1"). Used by advancement rules and for idempotent regenerate.
    ADD COLUMN IF NOT EXISTS bracket_match_code TEXT,
    -- Human placeholder shown until the slot resolves to a real club
    -- ("Ganador Octavos 1", "Perdedor Cuartos · Copa Oro 2").
    ADD COLUMN IF NOT EXISTS home_source_label TEXT,
    ADD COLUMN IF NOT EXISTS away_source_label TEXT,
    -- Structured origin of each slot, used to regenerate labels and to
    -- cascade-clear dependent matches when a result is edited.
    -- Shape: { "home": {type, ref}, "away": {type, ref} }
    --   type: 'seed' | 'winner' | 'loser'
    --   ref:  seed number, or source bracket_match_code
    ADD COLUMN IF NOT EXISTS participant_source JSONB;

CREATE INDEX IF NOT EXISTS idx_matches_bracket_code
    ON public.matches(phase_id, bracket_match_code)
    WHERE bracket_match_code IS NOT NULL;

-- ─── ADVANCEMENT RULES ──────────────────────────────────────────────────
-- One edge of the bracket graph: when source_match finishes, its winner
-- (or loser) is placed into target_match.target_slot, inside target_group
-- (the destination cup).
CREATE TABLE IF NOT EXISTS public.tournament_match_advancement_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    source_match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK (outcome IN ('winner', 'loser')),
    target_match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    target_slot TEXT NOT NULL CHECK (target_slot IN ('home', 'away')),
    target_group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_match_id, outcome),
    UNIQUE(target_match_id, target_slot)
);

CREATE INDEX IF NOT EXISTS idx_advancement_rules_source
    ON public.tournament_match_advancement_rules(source_match_id);
CREATE INDEX IF NOT EXISTS idx_advancement_rules_target
    ON public.tournament_match_advancement_rules(target_match_id);
CREATE INDEX IF NOT EXISTS idx_advancement_rules_phase
    ON public.tournament_match_advancement_rules(phase_id);

-- ─── RLS (mirrors tournament_groups / tournament_phases policies) ────────
ALTER TABLE public.tournament_match_advancement_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "public_read_advancement_rules"
        ON public.tournament_match_advancement_rules;
    DROP POLICY IF EXISTS "admin_manage_advancement_rules"
        ON public.tournament_match_advancement_rules;
END $$;

CREATE POLICY "public_read_advancement_rules"
    ON public.tournament_match_advancement_rules
    FOR SELECT USING (true);

CREATE POLICY "admin_manage_advancement_rules"
    ON public.tournament_match_advancement_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
              AND role IN ('super_admin', 'admin_general', 'admin')
        )
    );
