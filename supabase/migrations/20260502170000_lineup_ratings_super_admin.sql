-- Lineup ratings override for matches (Super Admin only).
-- For local matches (matches.id UUID): adds source/audit columns on `matches`.
-- For external/API matches (FlashScore, ESPN, Rugby API: text IDs): introduces
-- `external_match_lineup_overrides`, a text-keyed table mirroring the pattern
-- used by `external_tournament_standings_overrides`.

BEGIN;

-- 1) Local matches: source + audit columns on `matches`.
ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS lineups_source TEXT,
    ADD COLUMN IF NOT EXISTS lineups_rated_by UUID,
    ADD COLUMN IF NOT EXISTS lineups_rated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_lineups_source_check'
          AND conrelid = 'public.matches'::regclass
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_lineups_source_check
            CHECK (lineups_source IS NULL OR lineups_source IN ('local', 'api_override'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_lineups_rated_by_fkey'
          AND conrelid = 'public.matches'::regclass
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_lineups_rated_by_fkey
            FOREIGN KEY (lineups_rated_by)
            REFERENCES auth.users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.matches.lineups_source IS
    'Origen de la alineacion persistida en `lineups`: NULL = sin override, local = creada en Match Center, api_override = derivada de API y editada por Super Admin.';
COMMENT ON COLUMN public.matches.lineups_rated_by IS
    'Usuario (Super Admin) que aplico la ultima edicion de puntajes de alineacion.';
COMMENT ON COLUMN public.matches.lineups_rated_at IS
    'Timestamp de la ultima edicion de puntajes de alineacion.';

-- 2) External matches: lineup override storage keyed by external match id.
CREATE TABLE IF NOT EXISTS public.external_match_lineup_overrides (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'flashscore',
    lineups JSONB NOT NULL DEFAULT '{"home": [], "away": []}'::jsonb,
    rated_by UUID,
    rated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_match_lineup_overrides_provider
    ON public.external_match_lineup_overrides(provider);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'external_match_lineup_overrides_rated_by_fkey'
          AND conrelid = 'public.external_match_lineup_overrides'::regclass
    ) THEN
        ALTER TABLE public.external_match_lineup_overrides
            ADD CONSTRAINT external_match_lineup_overrides_rated_by_fkey
            FOREIGN KEY (rated_by)
            REFERENCES auth.users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE public.external_match_lineup_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "External match lineup overrides are viewable by everyone"
    ON public.external_match_lineup_overrides;
CREATE POLICY "External match lineup overrides are viewable by everyone"
    ON public.external_match_lineup_overrides FOR SELECT
    USING (true);

-- Writes are restricted at the API layer (service role / requireGlobalAdminApiUser),
-- but we still gate authenticated SQL writes to authenticated users so anon clients
-- cannot poke the table directly.
DROP POLICY IF EXISTS "Only authenticated users can insert external match lineup overrides"
    ON public.external_match_lineup_overrides;
CREATE POLICY "Only authenticated users can insert external match lineup overrides"
    ON public.external_match_lineup_overrides FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only authenticated users can update external match lineup overrides"
    ON public.external_match_lineup_overrides;
CREATE POLICY "Only authenticated users can update external match lineup overrides"
    ON public.external_match_lineup_overrides FOR UPDATE
    USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.external_match_lineup_overrides IS
    'Lineups (con puntajes editables) que sobreescriben la alineacion provista por el proveedor externo para un match_id externo (FlashScore/ESPN/Rugby API). Editado por Super Admin.';

-- 3) Audit log for rating edits (covers both local and external matches).
CREATE TABLE IF NOT EXISTS public.lineup_rating_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    actor_id UUID,
    before_lineups JSONB,
    after_lineups JSONB,
    source_before TEXT,
    source_after TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lineup_rating_audit_match_id
    ON public.lineup_rating_audit(match_id);
CREATE INDEX IF NOT EXISTS idx_lineup_rating_audit_actor_id
    ON public.lineup_rating_audit(actor_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'lineup_rating_audit_actor_id_fkey'
          AND conrelid = 'public.lineup_rating_audit'::regclass
    ) THEN
        ALTER TABLE public.lineup_rating_audit
            ADD CONSTRAINT lineup_rating_audit_actor_id_fkey
            FOREIGN KEY (actor_id)
            REFERENCES auth.users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON TABLE public.lineup_rating_audit IS
    'Bitacora de ediciones de puntajes de alineacion realizadas por Super Admin.';

ALTER TABLE public.lineup_rating_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'lineup_rating_audit'
          AND policyname = 'lineup_rating_audit_super_admin_select'
    ) THEN
        CREATE POLICY lineup_rating_audit_super_admin_select
            ON public.lineup_rating_audit
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('super_admin', 'admin_general')
                )
            );
    END IF;
END $$;

COMMIT;
