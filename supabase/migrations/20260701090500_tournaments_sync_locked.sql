-- Candado por torneo contra escrituras automáticas: cuando el dueño edita un
-- torneo a mano, puede marcarlo para que los procesos automáticos (syncs
-- externos ESPN/FlashScore, webhook de WhatsApp, imports) no lo pisen.
-- La edición manual desde el admin sigue permitida.

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS sync_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tournaments.sync_locked IS 'Si es true, los procesos automáticos (syncs externos, webhook WhatsApp, imports) no pueden modificar este torneo';
