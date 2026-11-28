-- Overlays COMPARTIDOS: el dueño de un enlace de "Mis overlays" genera un link
-- para compartir (/overlay/compartir/<share_token>) y se lo manda a alguien.
-- Quien lo abre inicia sesión en G22 y queda como co-gestor: ve el overlay en
-- su lista, lo edita, lo renueva y maneja el panel si es un overlay manual.
-- No lo puede borrar (eso es del dueño) y al aire sigue mandando el plan del
-- DUEÑO.
--
-- `share_token` es distinto del `token` que sale al aire: el de OBS no da
-- permiso de nada, y el de compartir se puede cortar (NULL) sin tocar OBS.
--
-- Sin políticas de RLS, igual que overlay_links: solo el servidor con service_role.
-- APLICADA en la base el 2026-11-28.

ALTER TABLE public.overlay_links ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS public.overlay_link_members (
    link_id UUID NOT NULL REFERENCES public.overlay_links(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (link_id, user_id)
);

COMMENT ON TABLE public.overlay_link_members IS 'Co-gestores de un overlay guardado (entraron por su link para compartir). Solo service_role.';

CREATE INDEX IF NOT EXISTS overlay_link_members_user_idx ON public.overlay_link_members (user_id, added_at DESC);

ALTER TABLE public.overlay_link_members ENABLE ROW LEVEL SECURITY;
