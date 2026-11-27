-- Enlaces de overlay guardados ("Mis overlays"): lo que se pega en OBS o vMix.
--
-- Una URL de overlay sola ya no sale al aire: el usuario la guarda y el servidor
-- le agrega `enlace=<token>`. Cada enlace vale 15 días desde que se guarda o se
-- renueva (expires_at); renovar mantiene el token, así que la fuente de OBS no
-- cambia. Vencido, la página al aire deja de dibujar el gráfico.
--
-- `path` es la ruta relativa SIN el token (`/overlay/tabla?torneo=…`): el token
-- vale solo para esa ruta.
--
-- Sin políticas de RLS: la toca solo el servidor con service_role
-- (`/api/overlay/enlaces` y las páginas `/overlay/*`).

CREATE TABLE IF NOT EXISTS public.overlay_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    renewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT overlay_links_title_len CHECK (char_length(title) BETWEEN 1 AND 120),
    CONSTRAINT overlay_links_path_len CHECK (char_length(path) BETWEEN 9 AND 4000),
    CONSTRAINT overlay_links_path_overlay CHECK (path LIKE '/overlay/%')
);

COMMENT ON TABLE public.overlay_links IS 'Enlaces de overlay guardados por usuario; vencen a los 15 días de guardados o renovados. Solo service_role.';

CREATE INDEX IF NOT EXISTS overlay_links_user_idx ON public.overlay_links (user_id, created_at DESC);

ALTER TABLE public.overlay_links ENABLE ROW LEVEL SECURITY;
