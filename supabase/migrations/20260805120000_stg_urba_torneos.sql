-- Staging de los torneos de URBA, para cruzar contra public.tournaments a mano.
--
-- Mismo método que se usó con los clubes: se carga el lado de URBA en una tabla
-- aparte y el cruce lo decide una persona mirando los casos. Nada se escribe en
-- `tournaments` sin esa revisión.
--
-- Alcance de esta carga: SÓLO 2026, 134 torneos. El histórico 2021-2025 entra
-- después por el mismo camino, sin cambios de código.
--
-- Cada rueda y cada playoff es un TORNEO SEPARADO, con su propio external_id.
-- Es lo que URBA publica y lo único representable con fidelidad: los 13 torneos
-- de "Ganadores" de 2026 se alimentan de más de una rueda a la vez, así que la
-- pregunta "¿de qué torneo es fase esta rueda?" no tiene respuesta correcta.
-- Medido: apareando por identidad de equipo con candidatos restringidos, sólo
-- 20 de 49 segundas ruedas quedaban no ambiguas y simétricas.

CREATE TABLE IF NOT EXISTS public.stg_urba_torneos (
    urba_id           INTEGER PRIMARY KEY,
    external_id       TEXT NOT NULL UNIQUE,   -- urba:{urba_id}
    nombre            TEXT NOT NULL,
    anio              INTEGER NOT NULL,
    division          TEXT,
    age_grade         TEXT,
    grado             TEXT,
    gender            TEXT,
    rueda             TEXT,
    equipos           INTEGER,
    partidos          INTEGER,
    partidos_jugados  INTEGER,
    fecha_desde       DATE,
    fecha_hasta       DATE,
    nombre_norm       TEXT NOT NULL
);

COMMENT ON TABLE public.stg_urba_torneos IS
    'Staging: torneos publicados por URBA. Se cruza a mano contra public.tournaments; no la lee la app.';
COMMENT ON COLUMN public.stg_urba_torneos.nombre_norm IS
    'nombre pasado por normalizeTournamentName() de src/lib/integrations/urba/externalId.ts: minúsculas, sin acentos, sin puntos ni comillas, espacios colapsados, trim. El otro lado del cruce TIENE que usar esa misma definición.';
COMMENT ON COLUMN public.stg_urba_torneos.rueda IS
    'primera | segunda | unica, leído del nombre. NO implica que sean fases de un mismo torneo: cada rueda es un torneo aparte.';

-- Es staging de trabajo, no dato de producto: no lo ve nadie desde el cliente.
REVOKE ALL ON public.stg_urba_torneos FROM anon, authenticated;
ALTER TABLE public.stg_urba_torneos ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: sólo service_role, que saltea RLS.

-- El cruce se hace por (nombre_norm, anio); el índice le ahorra el scan al LEFT JOIN.
CREATE INDEX IF NOT EXISTS stg_urba_torneos_cruce_idx
    ON public.stg_urba_torneos (nombre_norm, anio);

NOTIFY pgrst, 'reload schema';
