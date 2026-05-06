-- ============================================================
-- Tournament phase-scoped participants
-- ============================================================
-- Keeps the tournament-level participant as the canonical registration while
-- allowing each phase to define its own roster/group membership.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tournament_phase_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL,
    phase_id UUID NOT NULL REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES public.tournament_participants(id) ON DELETE CASCADE,
    group_id UUID NULL REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'pending', 'withdrawn', 'disqualified', 'archived')),
    seed INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tournament_phase_participants_unique_phase_participant UNIQUE (phase_id, participant_id)
);

CREATE INDEX IF NOT EXISTS tournament_phase_participants_tournament_idx
    ON public.tournament_phase_participants(tournament_id, phase_id);

CREATE INDEX IF NOT EXISTS tournament_phase_participants_season_idx
    ON public.tournament_phase_participants(season_id, phase_id)
    WHERE season_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tournament_phase_participants_participant_idx
    ON public.tournament_phase_participants(participant_id);

CREATE INDEX IF NOT EXISTS tournament_phase_participants_group_idx
    ON public.tournament_phase_participants(group_id)
    WHERE group_id IS NOT NULL;

-- Preserve existing semantics:
-- - grouped phases inherit the old tournament_participants.group_id assignment.
-- - phases without groups inherit all active tournament participants once, so
--   existing standings/fixtures do not become empty after applying this change.
INSERT INTO public.tournament_phase_participants (
    tournament_id,
    season_id,
    phase_id,
    participant_id,
    group_id,
    status,
    seed,
    created_at,
    updated_at
)
SELECT
    tp.tournament_id,
    COALESCE(g.season_id, p.season_id, tp.season_id),
    p.id,
    tp.id,
    tp.group_id,
    COALESCE(NULLIF(tp.status, ''), 'active'),
    tp.seed,
    COALESCE(tp.created_at, NOW()),
    COALESCE(tp.updated_at, NOW())
FROM public.tournament_participants tp
JOIN public.tournament_groups g ON g.id = tp.group_id
JOIN public.tournament_phases p ON p.id = g.phase_id
WHERE tp.group_id IS NOT NULL
ON CONFLICT (phase_id, participant_id) DO UPDATE
SET
    group_id = EXCLUDED.group_id,
    status = EXCLUDED.status,
    seed = EXCLUDED.seed,
    updated_at = NOW();

INSERT INTO public.tournament_phase_participants (
    tournament_id,
    season_id,
    phase_id,
    participant_id,
    group_id,
    status,
    seed,
    created_at,
    updated_at
)
SELECT
    tp.tournament_id,
    COALESCE(p.season_id, tp.season_id),
    p.id,
    tp.id,
    NULL,
    COALESCE(NULLIF(tp.status, ''), 'active'),
    tp.seed,
    COALESCE(tp.created_at, NOW()),
    COALESCE(tp.updated_at, NOW())
FROM public.tournament_phases p
JOIN public.tournament_participants tp
    ON tp.tournament_id = p.tournament_id
    AND (p.season_id IS NULL OR tp.season_id = p.season_id OR tp.season_id IS NULL)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tournament_groups g
    WHERE g.phase_id = p.id
)
ON CONFLICT (phase_id, participant_id) DO NOTHING;

ALTER TABLE public.tournament_phase_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_phase_participants_public_read
    ON public.tournament_phase_participants;
CREATE POLICY tournament_phase_participants_public_read
    ON public.tournament_phase_participants
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS tournament_phase_participants_admin_manage
    ON public.tournament_phase_participants;
DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        CREATE POLICY tournament_phase_participants_admin_manage
            ON public.tournament_phase_participants
            FOR ALL
            TO authenticated
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin());
    ELSIF to_regprocedure('public.is_admin()') IS NOT NULL THEN
        CREATE POLICY tournament_phase_participants_admin_manage
            ON public.tournament_phase_participants
            FOR ALL
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    ELSE
        CREATE POLICY tournament_phase_participants_admin_manage
            ON public.tournament_phase_participants
            FOR ALL
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.users
                    WHERE id = auth.uid()
                      AND role IN ('super_admin', 'admin_general', 'admin')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM public.users
                    WHERE id = auth.uid()
                      AND role IN ('super_admin', 'admin_general', 'admin')
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS tournament_phase_participants_updated_at
            ON public.tournament_phase_participants;
        CREATE TRIGGER tournament_phase_participants_updated_at
            BEFORE UPDATE ON public.tournament_phase_participants
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;

COMMENT ON TABLE public.tournament_phase_participants IS
    'Phase-specific roster membership for tournament participants. Removing a row only removes the participant from that phase.';

NOTIFY pgrst, 'reload schema';

COMMIT;
