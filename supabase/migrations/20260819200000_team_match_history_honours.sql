-- Historial de partidos por equipo + palmarés de equipos externos.
--
-- 1) external_match_cache ya vincula cada partido con sus dos equipos, pero el
--    id del equipo vive adentro del JSONB (home_team->>'id') y no se puede
--    indexar. Dos columnas generadas exponen ese vínculo para responder
--    "todos los partidos del equipo X" sin escanear la tabla. Son derivadas:
--    ninguna escritura existente cambia.
-- 2) external_teams.rugbyarchive_id vincula un equipo externo (FlashScore)
--    con su ficha en rugbyarchive.net (Argentina = 595). El importador de
--    historial usa ese vínculo y la página del club lo lee para sumar los
--    partidos importados a la consulta.
-- 3) external_team_honours guarda el palmarés: una fila por
--    (equipo, competición, temporada, resultado). El agregado por competición
--    (N títulos, años) se calcula al leer, nunca se persiste.

-- ── 1. Vínculo equipo→partido consultable ────────────────────────────────────

ALTER TABLE public.external_match_cache
    ADD COLUMN IF NOT EXISTS home_team_id TEXT GENERATED ALWAYS AS (home_team->>'id') STORED;
ALTER TABLE public.external_match_cache
    ADD COLUMN IF NOT EXISTS away_team_id TEXT GENERATED ALWAYS AS (away_team->>'id') STORED;

CREATE INDEX IF NOT EXISTS emc_home_team_date_idx
    ON public.external_match_cache (home_team_id, date_time DESC);
CREATE INDEX IF NOT EXISTS emc_away_team_date_idx
    ON public.external_match_cache (away_team_id, date_time DESC);

-- ── 2. Vínculo FlashScore ↔ rugbyarchive ─────────────────────────────────────

ALTER TABLE public.external_teams
    ADD COLUMN IF NOT EXISTS rugbyarchive_id TEXT;

CREATE INDEX IF NOT EXISTS ext_teams_rugbyarchive_idx
    ON public.external_teams (rugbyarchive_id)
    WHERE rugbyarchive_id IS NOT NULL;

-- ── 3. Palmarés ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.external_team_honours (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id          TEXT NOT NULL,              -- id externo del equipo (FlashScore crudo o 'ra-team-<id>')
    sport            TEXT NOT NULL DEFAULT 'rugby',
    source           TEXT NOT NULL DEFAULT 'manual',   -- manual | rugbyarchive
    source_ref       TEXT,                       -- p. ej. 'rugbyarchive:595'
    competition_name TEXT NOT NULL,
    season           TEXT NOT NULL,              -- '2024' o '2023/24', como lo publica la fuente
    result           TEXT NOT NULL DEFAULT 'champion'
                     CHECK (result IN ('champion', 'runner_up')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS eth_team_comp_season_result_key
    ON public.external_team_honours (team_id, competition_name, season, result);
CREATE INDEX IF NOT EXISTS eth_team_idx
    ON public.external_team_honours (team_id);

DROP TRIGGER IF EXISTS external_team_honours_updated_at ON public.external_team_honours;
CREATE TRIGGER external_team_honours_updated_at
    BEFORE UPDATE ON public.external_team_honours
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.external_team_honours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eth_public_read" ON public.external_team_honours;
CREATE POLICY "eth_public_read" ON public.external_team_honours
    FOR SELECT USING (TRUE);

-- Escrituras vía service_role (importadores), que saltea RLS. Sin política de
-- INSERT/UPDATE a propósito.
