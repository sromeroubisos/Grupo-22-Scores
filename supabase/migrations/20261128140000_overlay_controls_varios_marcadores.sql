-- Un marcador manual ahora guarda VARIOS partidos (el al aire + hasta 9 en
-- espera, `state.queue`), cada uno con sus equipos, planteles y eventos. El
-- tope de 16 KB quedaba corto: pasa a 96 KB (sigue frenando un abuso).
-- APLICADA en la base el 2026-11-28.

ALTER TABLE public.overlay_controls DROP CONSTRAINT IF EXISTS overlay_controls_state_size;
ALTER TABLE public.overlay_controls ADD CONSTRAINT overlay_controls_state_size CHECK (pg_column_size(state) <= 96000);
