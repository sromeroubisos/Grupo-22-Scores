-- ─────────────────────────────────────────────────────────────────────────────
-- Sponsors de clubes y torneos.
--
-- Una sola tabla para los dos dueños: la gestión, la subida de imagen y la
-- vitrina pública son la misma pieza en el gestor de club y en el de torneo.
-- Cada fila apunta a su dueño con una FK REAL (club_id o tournament_id, nunca
-- los dos), así que borrar el club o el torneo se lleva sus sponsors.
--
-- `club_sponsors` (20260413230000) queda como estaba: vacía, con otro modelo
-- (niveles oro/plata, contrato) y sin pantalla que la use.
--
-- Columnas pensadas para lo que viene y que HOY no tienen interfaz:
--   tier       principal / secundario (null = sin jerarquía)
--   placement  posición dentro de la página ('default' = la vitrina actual)
--   link_url   web o red social del sponsor
--   starts_at / ends_at  ventana de la campaña (null = sin límite)
-- La lectura pública ya respeta la ventana, así que cargarla no pide cambiar
-- la consulta.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.entity_sponsors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type      text NOT NULL CHECK (owner_type IN ('club', 'tournament')),
    club_id         text REFERENCES public.clubs(id) ON DELETE CASCADE,
    tournament_id   uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    format          text NOT NULL CHECK (format IN ('banner', 'logo')),
    image_url       text NOT NULL CHECK (image_url ~ '^https?://'),
    image_width     integer CHECK (image_width IS NULL OR image_width > 0),
    image_height    integer CHECK (image_height IS NULL OR image_height > 0),
    sort_order      integer NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true,
    tier            text CHECK (tier IS NULL OR tier IN ('principal', 'secundario')),
    placement       text NOT NULL DEFAULT 'default',
    link_url        text CHECK (link_url IS NULL OR link_url ~ '^https?://'),
    starts_at       timestamptz,
    ends_at         timestamptz,
    created_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT entity_sponsors_one_owner CHECK (
        (owner_type = 'club' AND club_id IS NOT NULL AND tournament_id IS NULL)
        OR (owner_type = 'tournament' AND tournament_id IS NOT NULL AND club_id IS NULL)
    ),
    CONSTRAINT entity_sponsors_window CHECK (
        starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
    )
);

CREATE INDEX IF NOT EXISTS entity_sponsors_club_order_idx
    ON public.entity_sponsors (club_id, sort_order)
    WHERE club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entity_sponsors_tournament_order_idx
    ON public.entity_sponsors (tournament_id, sort_order)
    WHERE tournament_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.entity_sponsors_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_sponsors_touch_updated_at ON public.entity_sponsors;
CREATE TRIGGER entity_sponsors_touch_updated_at
    BEFORE UPDATE ON public.entity_sponsors
    FOR EACH ROW EXECUTE FUNCTION public.entity_sponsors_touch_updated_at();

-- RLS: el público lee lo activo y vigente; nadie escribe con su propia sesión.
-- La app escribe con service role DESPUÉS de resolver los permisos del club o
-- del torneo en el servidor (src/lib/sponsors/server.ts), como el resto de los
-- gestores.
ALTER TABLE public.entity_sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entity_sponsors_public_read ON public.entity_sponsors;
CREATE POLICY entity_sponsors_public_read ON public.entity_sponsors
    FOR SELECT TO anon, authenticated
    USING (
        is_active
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at > now())
    );

-- Bucket público para las imágenes. El servidor ya las entrega redimensionadas
-- en WebP; el límite de 5 MB y la lista de tipos son la segunda puerta.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sponsors', 'sponsors', true, 5242880, ARRAY['image/webp', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

NOTIFY pgrst, 'reload schema';
