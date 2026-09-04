-- Sponsors por torneo.
--
-- Cada torneo puede tener 0, 1 o muchos sponsors; cada sponsor pertenece a UN
-- torneo (tournament_id, ON DELETE CASCADE). El gestor del torneo administra
-- nombre, logo, monto y estado desde la pestaña "Sponsors" del gestor.
--
-- `amount` es el valor administrativo del espacio publicitario. Va NULL por
-- defecto a propósito: la tarifa todavía no está definida y NO se hardcodea un
-- precio. Cuando se decida, se carga desde la administración o se parametriza
-- por `tier`/paquete comercial (columnas ya previstas abajo, sin UI todavía).
--
-- El monto es un dato administrativo: NUNCA se expone en la página pública.
-- Para garantizarlo a nivel base, la lectura pública sale por la vista
-- `tournament_sponsors_public`, que no incluye `amount` ni `currency` y filtra
-- solo los sponsors activos. La tabla base no tiene política de SELECT para
-- anon/authenticated: se lee con service role desde las rutas admin, que ya
-- validan el permiso sobre el torneo (requireTournamentMutationContext).

CREATE TABLE IF NOT EXISTS public.tournament_sponsors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    logo_url TEXT,
    -- Valor del espacio para este sponsor. NULL = todavía sin definir.
    amount NUMERIC(14, 2),
    currency TEXT NOT NULL DEFAULT 'ARS',
    status TEXT NOT NULL DEFAULT 'active',
    -- Preparado para versiones futuras (sin UI todavía): categoría/paquete,
    -- ubicación en la página, vigencia, link comercial y orden de aparición.
    tier TEXT,
    placement TEXT,
    website_url TEXT,
    starts_at DATE,
    ends_at DATE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT tournament_sponsors_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT tournament_sponsors_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT tournament_sponsors_amount_non_negative CHECK (amount IS NULL OR amount >= 0),
    CONSTRAINT tournament_sponsors_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.tournament_sponsors IS 'Sponsors de un torneo. El monto es administrativo y no se publica.';
COMMENT ON COLUMN public.tournament_sponsors.amount IS 'Valor del espacio publicitario. NULL mientras la tarifa no esté definida; nunca se muestra en público.';
COMMENT ON COLUMN public.tournament_sponsors.tier IS 'Categoría o paquete comercial (principal, secundario...). Reservado para versiones futuras.';
COMMENT ON COLUMN public.tournament_sponsors.placement IS 'Ubicación dentro de la página pública. Reservado para versiones futuras.';

CREATE INDEX IF NOT EXISTS tournament_sponsors_tournament_idx
    ON public.tournament_sponsors (tournament_id, status, sort_order, created_at);

DROP TRIGGER IF EXISTS trg_tournament_sponsors_updated_at ON public.tournament_sponsors;
CREATE TRIGGER trg_tournament_sponsors_updated_at
    BEFORE UPDATE ON public.tournament_sponsors
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tournament_sponsors ENABLE ROW LEVEL SECURITY;

-- Solo los administradores globales leen y escriben la tabla base por RLS.
-- El gestor de torneos (rol gestor_torneos + membresía) opera a través de las
-- rutas /api/admin/tournaments/[id]/sponsors con service role, con el scope
-- ya validado en la aplicación. Sin política para anon a propósito.
DROP POLICY IF EXISTS "admin_manage_tournament_sponsors" ON public.tournament_sponsors;
CREATE POLICY "admin_manage_tournament_sponsors"
    ON public.tournament_sponsors
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Vista pública: SOLO lo comercial (logo, nombre, link) de los sponsors
-- activos de torneos visibles. Sin `amount`, sin `currency`. La vista corre con
-- los privilegios del dueño (security_invoker off), así que anon puede leerla
-- sin tener acceso a la tabla.
CREATE OR REPLACE VIEW public.tournament_sponsors_public AS
    SELECT
        s.id,
        s.tournament_id,
        s.name,
        s.logo_url,
        s.website_url,
        s.tier,
        s.placement,
        s.sort_order
    FROM public.tournament_sponsors s
    JOIN public.tournaments t ON t.id = s.tournament_id
    WHERE s.status = 'active'
      AND (s.starts_at IS NULL OR s.starts_at <= CURRENT_DATE)
      AND (s.ends_at IS NULL OR s.ends_at >= CURRENT_DATE)
      AND COALESCE(t.is_visible, false) = true;

COMMENT ON VIEW public.tournament_sponsors_public IS 'Sponsors activos para la página pública del torneo. No incluye el monto.';

GRANT SELECT ON public.tournament_sponsors_public TO anon, authenticated;

-- Los logos de los sponsors se guardan en el bucket público `tournaments`
-- (el mismo de los escudos), bajo sponsors/{tournament_id}/... Se sube con
-- service role desde la API, así que no hace falta política de storage.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tournaments', 'tournaments', TRUE)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
