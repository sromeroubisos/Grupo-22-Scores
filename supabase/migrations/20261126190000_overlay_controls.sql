-- Overlays manuales de transmisión (/overlay/manual/<id>): un marcador o un
-- titular que maneja el productor desde un panel (/overlay/control/<id>), sin
-- cargar el partido en G22.
--
-- El panel y el overlay corren en programas distintos (el navegador del
-- productor, OBS/vMix, a veces un celular): el estado tiene que vivir en el
-- servidor. Una fila por overlay; `state` es el JSON que dibuja el overlay.
--
-- Quién puede escribir: quien tenga la CLAVE del panel. Se guarda solo su hash
-- (sha256); la clave viaja en el fragmento (#) de la URL del panel, que no llega
-- a los logs. Leer es público: es lo que ya se ve al aire.
--
-- Sin políticas de RLS: la tabla la toca solo el servidor con service_role
-- (`/api/overlay/control`). La clave anónima no puede ni leerla.

CREATE TABLE IF NOT EXISTS public.overlay_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    edit_key_hash TEXT NOT NULL,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT overlay_controls_kind CHECK (kind IN ('marcador', 'titular')),
    -- Un marcador o un titular son unos pocos campos: el tope frena un abuso.
    CONSTRAINT overlay_controls_state_size CHECK (pg_column_size(state) <= 16000)
);

COMMENT ON TABLE public.overlay_controls IS 'Overlays manuales de transmisión (marcador/titular). Escribe el servidor con la clave del panel; leer es público vía /api/overlay/control.';

CREATE INDEX IF NOT EXISTS overlay_controls_created_by_idx ON public.overlay_controls (created_by);

ALTER TABLE public.overlay_controls ENABLE ROW LEVEL SECURITY;
