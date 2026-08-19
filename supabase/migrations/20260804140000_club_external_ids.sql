-- Mapeo de identidades externas de club, multiproveedor.
--
-- Reemplaza al único slot que había hasta ahora (`clubs.external_id`, TEXT suelto
-- sin columna de proveedor y ya ocupado por el mapeo a ESPN), que no permite que
-- un club tenga ids de dos proveedores a la vez.
--
-- NO lleva UNIQUE (club_id, provider) A PROPÓSITO. En URBA la identidad de un
-- equipo es el triple (club_id de URBA, categoría del torneo, sufijo del equipo):
-- una misma institución mete varios equipos a la vez. GEBA (club_id 30) juega
-- mayores, mayores C, intermedia y cuatro preintermedias — siete filas que caen
-- todas en el club `geba`. Los Tilos llega a diez. Con esa restricción el import
-- se caía en la sexta fila de GEBA, y el "arreglo" natural —borrar filas del CSV—
-- habría hecho desaparecer categorías enteras sin que saltara ningún error.
--
-- El formato de `external_id` para URBA es `{urba_club_id}|{categoria}|{sufijo}`,
-- con el sufijo vacío como string vacío. Lo serializa una única función,
-- `buildUrbaExternalId` en src/lib/integrations/urba/externalId.ts, usada tanto
-- por el generador del CSV de mapeo como por el resolvedor de partidos de la sync.

CREATE TABLE IF NOT EXISTS public.club_external_ids (
    provider     TEXT NOT NULL,           -- 'urba' | 'flashscore' | 'espn'
    external_id  TEXT NOT NULL,           -- para URBA: el triple serializado
    club_id      TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    urba_club_id INTEGER,                 -- desnormalizado, para poder consultar
    categoria    TEXT,
    sufijo       TEXT,
    confidence   TEXT NOT NULL DEFAULT 'exacto',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, external_id),
    -- Cierra la puerta a un external_id malformado: el modo de falla de este
    -- mapeo es SILENCIOSO (el partido no encuentra su club y no salta error),
    -- así que conviene que reviente en la carga. Ver 20260804150000 para el
    -- ALTER equivalente sobre bases donde la tabla ya existía.
    CONSTRAINT club_external_ids_urba_format_check
        CHECK (provider <> 'urba' OR external_id ~ '^[0-9]+\|[^|]+\|[A-H]?$')
);

-- Resolver "qué ids externos tiene este club" (pantalla de club, diagnóstico).
CREATE INDEX IF NOT EXISTS club_external_ids_club_id_idx
    ON public.club_external_ids (club_id);

-- Resolver "todos los equipos de esta institución de URBA" sin parsear el triple.
CREATE INDEX IF NOT EXISTS club_external_ids_provider_urba_club_id_idx
    ON public.club_external_ids (provider, urba_club_id);

COMMENT ON TABLE public.club_external_ids IS
    'Mapeo (proveedor, id externo) -> club de G22. Un club puede tener VARIAS filas por proveedor: en URBA, una por cada (categoría, sufijo) en que compite.';
COMMENT ON COLUMN public.club_external_ids.external_id IS
    'URBA: {urba_club_id}|{categoria}|{sufijo}, sufijo vacío = string vacío. Serializado por buildUrbaExternalId() — no armar esta cadena a mano.';
COMMENT ON COLUMN public.club_external_ids.confidence IS
    'exacto | parcial | manual. Cómo se resolvió el vínculo, para poder auditar después.';

-- RLS: la simplificación de esquema dejó RLS activo en todas las tablas de public,
-- así que sin política explícita anon/authenticated no leen nada.
ALTER TABLE public.club_external_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_external_ids_select ON public.club_external_ids;
CREATE POLICY club_external_ids_select
    ON public.club_external_ids
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Las escrituras van por service_role (createAdminClient), que saltea RLS.
-- No se otorga INSERT/UPDATE/DELETE a anon ni a authenticated a propósito:
-- el mapeo lo escriben la carga inicial y la sync, no el cliente.

NOTIFY pgrst, 'reload schema';
