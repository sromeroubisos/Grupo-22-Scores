-- El puntaje de 1 a 10 de cada jugador en cada partido de un proveedor externo
-- (hoy: RugbyPass).
--
-- ── POR QUE HACE FALTA GUARDARLO ────────────────────────────────────────────
-- El puntaje lo calcula `rugbyPlayerRating.ts` a partir de la PLANILLA del
-- partido: avances, metros, tackles y pases, entre otros. Esa planilla no viene
-- en el calendario ni en la ficha del jugador — se pide partido por partido, y
-- son veintitres requests al proveedor por partido (`filter-players-stats` va
-- un pedido por rubro, y son veintidos, mas la ficha con las alineaciones).
--
-- Calcularlo al vuelo para la tabla de partidos de un jugador serian cientos de
-- requests por visita. Y no hace falta: un partido terminado no cambia mas, asi
-- que se puntua UNA vez —el cron de `rugbypass-ratings`— y despues se lee.
--
-- ── POR QUE NO VA EN `match_events` NI EN UNA TABLA DE `matches` ────────────
-- Mismo motivo que `external_match_events`: el partido externo no tiene fila en
-- `matches` ni un id con forma de UUID (el de RugbyPass es `rp-946625`). El
-- `match_id` es TEXT y apunta a `external_match_cache.id`, con CASCADE para que
-- limpiar la cache limpie sus puntajes.

CREATE TABLE IF NOT EXISTS public.external_match_player_ratings (
    match_id     TEXT NOT NULL REFERENCES public.external_match_cache(id) ON DELETE CASCADE,
    -- El slug del jugador en el proveedor (`pablo-matera`), que es la identidad
    -- EXACTA: sale del link de la alineacion. No se pliega por nombre, que es lo
    -- que ya dejo dos fichas distintas con el mismo apellido.
    player_slug  TEXT NOT NULL,
    player_name  TEXT NOT NULL,
    -- De 1,0 a 10,0. La escala y la cuenta son las de `rugbyPlayerRating.ts`,
    -- las mismas que muestra la planilla del Match Center.
    rating       NUMERIC(3,1) NOT NULL,
    -- Minutos en cancha, leidos de la alineacion. Sin minutos no hay puntaje, y
    -- por eso el que no entro no deja fila: la ausencia dice "no jugo", que no
    -- es lo mismo que un puntaje bajo.
    minutes      INTEGER NOT NULL,
    -- Numero de camiseta, que en rugby dice el puesto sin ambiguedad. Es con lo
    -- que el motor pesa cada rubro.
    position     INTEGER,
    -- El comienzo del partido, COPIADO de la cache a proposito.
    --
    -- La ficha del jugador cruza sus partidos con estos puntajes por FECHA: el
    -- proveedor publica el partido en la ficha sin id, asi que el dia es la
    -- unica llave. Tenerlo aca ahorra el join y deja que el indice de abajo
    -- conteste solo. Se copia una vez, cuando el partido ya se jugo, y un
    -- partido jugado no se mueve de dia.
    kickoff      TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, player_slug)
);

-- La consulta de la ficha: todos los puntajes de un jugador, del mas nuevo al
-- mas viejo.
CREATE INDEX IF NOT EXISTS idx_external_match_player_ratings_player
    ON public.external_match_player_ratings(player_slug, kickoff DESC);

ALTER TABLE public.external_match_player_ratings ENABLE ROW LEVEL SECURITY;

-- Lectura publica: son datos de partidos publicos, igual que la cache.
DROP POLICY IF EXISTS external_match_player_ratings_read ON public.external_match_player_ratings;
CREATE POLICY external_match_player_ratings_read
    ON public.external_match_player_ratings
    FOR SELECT
    USING (true);

-- La escritura queda para service_role (el cron y el backfill). Sin policy de
-- escritura, anon y authenticated no pueden insertar ni borrar.


-- QUE PARTIDOS YA SE PUNTEARON.
--
-- No alcanza con mirar si hay filas en la tabla de arriba: un partido puede
-- quedar SIN puntajes por motivos legitimos —la planilla no salio entera, el
-- proveedor no publica estadisticas de esa competicion— y sin esta marca el
-- cron volveria a gastarle veintitres requests cada hora, para siempre.
CREATE TABLE IF NOT EXISTS public.external_match_rating_runs (
    match_id  TEXT PRIMARY KEY REFERENCES public.external_match_cache(id) ON DELETE CASCADE,
    rated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Cuantos jugadores quedaron puntuados. Cero es un resultado valido.
    players   INTEGER NOT NULL DEFAULT 0,
    -- Si la planilla alcanzo para puntuar. En falso el partido queda cerrado
    -- igual: se puede reabrir a mano borrando la fila.
    ok        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_external_match_rating_runs_rated_at
    ON public.external_match_rating_runs(rated_at DESC);

ALTER TABLE public.external_match_rating_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_match_rating_runs_read ON public.external_match_rating_runs;
CREATE POLICY external_match_rating_runs_read
    ON public.external_match_rating_runs
    FOR SELECT
    USING (true);
