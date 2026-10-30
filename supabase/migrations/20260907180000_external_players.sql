-- Los JUGADORES de un proveedor externo, para que el buscador los encuentre.
--
-- Los equipos externos ya tenian donde vivir (`external_teams`) y por eso el
-- buscador los ofrecia; los jugadores no. Los 5045 de RugbyPass estaban
-- parseados y sus fichas abrian (`/players/rp-player-<slug>`), pero no habia
-- forma de LLEGAR a ellos: nadie los indexaba.
--
-- La tabla es un INDICE, no la ficha. Guarda lo justo para reconocer a alguien
-- en una lista de resultados —nombre, puesto, club— y el id con el que la ficha
-- se resuelve sola contra el catalogo del proveedor. Ni estadisticas ni
-- partidos: eso ya vive en `external_match_player_ratings` y en el catalogo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.external_players (
    -- `rp-player-<slug>`: el MISMO id con el que abre /players/<id>.
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'rugbypass',
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    -- El puesto tal como lo rotula el proveedor ("Back Row", "Outside Back").
    position TEXT,
    -- El club vigente, por nombre. `team_slug` es null cuando el club no esta
    -- entre los vigentes del proveedor: un jugador arrastra clubes historicos
    -- que ya no tienen ficha, y perderlos borraria su trayectoria.
    team_name TEXT,
    team_slug TEXT,
    photo_url TEXT,
    sport TEXT NOT NULL DEFAULT 'rugby',
    -- Si integra un plantel vigente. No filtra: ordena. El que dejo de jugar
    -- sigue teniendo ficha y quien lo busca por nombre tiene que encontrarlo.
    current_squad BOOLEAN NOT NULL DEFAULT TRUE,
    competition_ids INTEGER[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_players_source_sport
    ON public.external_players(source, sport);

CREATE INDEX IF NOT EXISTS idx_external_players_current_squad
    ON public.external_players(current_squad);

-- El buscador pregunta `name ILIKE '%texto%'`, y a eso un btree no lo ayuda:
-- el comodin de la izquierda le prohibe usar el arbol. Trigramas si. Va en un
-- bloque tolerante porque la extension puede no estar habilitada en la base, y
-- perder el indice es una consulta mas lenta sobre 5045 filas, no un error.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS idx_external_players_name_trgm
        ON public.external_players USING GIN (name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm no disponible: external_players.name queda sin indice de texto';
END $$;

ALTER TABLE public.external_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_players_select ON public.external_players;
CREATE POLICY external_players_select
    ON public.external_players
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS external_players_insert ON public.external_players;
CREATE POLICY external_players_insert
    ON public.external_players
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS external_players_update ON public.external_players;
CREATE POLICY external_players_update
    ON public.external_players
    FOR UPDATE
    TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';

COMMIT;
