BEGIN;

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS referee TEXT,
    ADD COLUMN IF NOT EXISTS pitch TEXT,
    ADD COLUMN IF NOT EXISTS broadcast_url TEXT,
    ADD COLUMN IF NOT EXISTS replay_url TEXT;

COMMENT ON COLUMN public.matches.referee IS 'Arbitro principal asignado al partido.';
COMMENT ON COLUMN public.matches.pitch IS 'Cancha o campo especifico dentro de la sede.';
COMMENT ON COLUMN public.matches.broadcast_url IS 'Enlace principal de transmision del partido.';
COMMENT ON COLUMN public.matches.replay_url IS 'Enlace de repeticion o video bajo demanda del partido.';

NOTIFY pgrst, 'reload schema';

COMMIT;
