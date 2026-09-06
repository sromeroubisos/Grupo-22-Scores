-- Eventos de partidos de proveedores externos (hoy: RugbyPass).
--
-- NO pueden ir en `match_events`: esa tabla declara
-- `match_id UUID NOT NULL REFERENCES public.matches(id)`, y un partido externo
-- no tiene fila en `matches` ni un id con forma de UUID — el de RugbyPass es
-- `rp-946625`. Forzar un id externo dentro de una columna uuid es exactamente
-- lo que ya rompio la base una vez.
--
-- Por eso `match_id` es TEXT y apunta a `external_match_cache.id`. La FK va con
-- ON DELETE CASCADE para que limpiar la cache limpie sus eventos.

CREATE TABLE IF NOT EXISTS public.external_match_events (
    match_id    TEXT NOT NULL REFERENCES public.external_match_cache(id) ON DELETE CASCADE,
    -- Orden cronologico dentro del partido. Es parte de la clave porque un
    -- partido puede tener dos eventos identicos (dos tries del mismo jugador en
    -- el mismo minuto no es imposible) y no queremos perder uno.
    sort_order  INTEGER NOT NULL,
    -- Tipo del catalogo del proyecto (`matchEventCatalog.ts`), ya traducido:
    -- try, conversion, penalty_goal, drop_goal, card_yellow, card_red,
    -- match_start, match_half, match_end.
    type        TEXT NOT NULL,
    -- 'home' | 'away' | NULL (los rotulos de fase no son de nadie).
    side        TEXT,
    minute      INTEGER,
    player_name TEXT,
    -- Slug del jugador en el proveedor. Sirve para volver a pedir su ficha y
    -- para emparejarlo mas adelante con `people` sin depender del nombre.
    player_slug TEXT,
    -- Marcador acumulado DESPUES del evento, tal como lo publica el proveedor.
    home_score  INTEGER,
    away_score  INTEGER,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_external_match_events_match_id
    ON public.external_match_events(match_id);

ALTER TABLE public.external_match_events ENABLE ROW LEVEL SECURITY;

-- Lectura publica: son datos de partidos publicos, igual que la cache.
DROP POLICY IF EXISTS external_match_events_read ON public.external_match_events;
CREATE POLICY external_match_events_read
    ON public.external_match_events
    FOR SELECT
    USING (true);

-- La escritura queda para service_role (los crons). Sin policy de escritura,
-- anon y authenticated no pueden insertar ni borrar.
