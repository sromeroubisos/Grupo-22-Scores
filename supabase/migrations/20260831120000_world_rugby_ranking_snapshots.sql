-- Ranking de uniones de World Rugby: una foto por categoría y por semana.
--
-- Ojo con el nombre: `club_rankings.algorithm = 'world_rugby'` es OTRA cosa —
-- ahí "world rugby" nombra la FÓRMULA con la que calculamos el ranking de
-- clubes a partir de nuestros partidos. Esta tabla no calcula nada: guarda el
-- ranking oficial de selecciones tal como lo publica World Rugby.
--
-- `entries` es la lista completa de uniones, en el orden del puesto, con la
-- forma que define `WorldRugbyEntry` en
-- src/lib/integrations/worldrugby/rankings.ts:
--   { teamId, name, nameEs, code, countryId, flagUrl, region,
--     position, previousPosition, points, previousPoints }
--
-- Va en JSONB y no en una tabla de filas porque nunca se consulta una unión
-- suelta: se lee la foto entera o no se lee. Son ~114 filas y ~30 KB.
--
-- La llave es (categoría, fecha): el cron de los lunes puede correr dos veces
-- sin duplicar nada, y mañana se puede hacer backfill del histórico (la API
-- responde desde 2003-10-13) sin tocar el esquema.
--
-- Hasta que esta migración corra, `src/lib/server/worldRugbyRankings.ts`
-- detecta la tabla ausente y la pantalla sigue andando contra la API en vivo:
-- lo único que se pierde es el respaldo para cuando Pulselive no conteste.

CREATE TABLE IF NOT EXISTS public.world_rugby_ranking_snapshots (
    -- 'mru' = uniones masculinas, 'wru' = femeninas. Son los dos únicos slugs
    -- válidos de la API; el seven va por otro camino y todavía no está.
    category TEXT NOT NULL CHECK (category IN ('mru', 'wru')),
    effective_date DATE NOT NULL,
    -- El rótulo que devuelve la API: "Mens Rugby Union".
    label TEXT NOT NULL DEFAULT '',
    -- Cuándo lo trajimos, que no es lo mismo que a qué semana corresponde.
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (category, effective_date),
    CONSTRAINT world_rugby_ranking_snapshots_entries_is_array
        CHECK (jsonb_typeof(entries) = 'array')
);

COMMENT ON TABLE public.world_rugby_ranking_snapshots IS
    'Foto semanal del ranking oficial de selecciones de World Rugby. La escribe /api/cron/world-rugby-rankings los lunes.';

-- La consulta que hace la pantalla es siempre la misma: la última foto de una
-- categoría.
CREATE INDEX IF NOT EXISTS idx_world_rugby_snapshots_category_date
    ON public.world_rugby_ranking_snapshots(category, effective_date DESC);

-- `set_updated_at()` nació en 20260219300000_club_divisions_venues.sql, pero
-- esta base tiene migraciones sin correr y no se puede dar por sentado que esté.
-- Si no está, el CREATE TRIGGER de abajo aborta la migración entera. Mismo
-- cuerpo, idempotente: recrearla no rompe a nadie.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_world_rugby_snapshots_updated_at
    ON public.world_rugby_ranking_snapshots;
CREATE TRIGGER trg_world_rugby_snapshots_updated_at
    BEFORE UPDATE ON public.world_rugby_ranking_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.world_rugby_ranking_snapshots ENABLE ROW LEVEL SECURITY;

-- El ranking es público en world.rugby y es público acá: /rankings se ve sin
-- login.
DROP POLICY IF EXISTS "public_read_world_rugby_snapshots"
    ON public.world_rugby_ranking_snapshots;
CREATE POLICY "public_read_world_rugby_snapshots"
    ON public.world_rugby_ranking_snapshots
    FOR SELECT
    USING (true);

-- Escribir es sólo del cron, que entra por service_role. Sin política de
-- INSERT/UPDATE, nadie más puede tocarla.

-- PostgREST cachea el esquema: hasta que lo recargue, sigue contestando
-- PGRST205 y el cron va a seguir creyendo que la tabla no existe. Supabase
-- suele recargarlo solo, pero esto lo fuerza y no cuesta nada.
NOTIFY pgrst, 'reload schema';

-- Para verificar que quedó (debería devolver el nombre de la tabla, no NULL):
--   SELECT to_regclass('public.world_rugby_ranking_snapshots');
