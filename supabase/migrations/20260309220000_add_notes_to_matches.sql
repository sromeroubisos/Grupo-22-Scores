-- Migration: Add notes column to matches table
-- Description: Enables persistence of additional match information.

ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS round_label TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.matches.notes IS 'Notas adicionales del partido (ej: incidencias, clima, etc.)';
COMMENT ON COLUMN public.matches.round_label IS 'Etiqueta manual de la jornada (ej: Fecha 1, Semifinal)';

-- Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
