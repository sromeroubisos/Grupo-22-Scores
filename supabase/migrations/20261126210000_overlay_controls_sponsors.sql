-- Overlay manual de sponsors: logos en cuatro niveles (Title, Main, Sponsor,
-- Acompañante) que se suben desde el panel. Vive en la misma tabla que el
-- marcador y el titular manuales: solo se suma el tipo.
--
-- Los PNG van al bucket público `sponsors`, bajo `overlay/<id del overlay>/`;
-- en la fila queda la URL de cada uno (el estado sigue con su tope de 16 KB).

ALTER TABLE public.overlay_controls DROP CONSTRAINT IF EXISTS overlay_controls_kind;

ALTER TABLE public.overlay_controls
    ADD CONSTRAINT overlay_controls_kind CHECK (kind IN ('marcador', 'titular', 'sponsors'));
