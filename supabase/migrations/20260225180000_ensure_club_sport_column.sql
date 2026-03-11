-- ============================================================
-- MIGRATION: Ensure 'sport' and 'is_visible' column in clubs
-- Fecha: 2026-02-25
-- Descripción: Corrección de emergencia para asegurar que las columnas
--              obligatorias existan tras la normalización.
-- ============================================================

-- 1. Agregar columnas si no existen
ALTER TABLE public.clubs 
    ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'rugby',
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;

-- 2. Asegurar el listado completo de deportes en el CHECK constraint
ALTER TABLE public.clubs 
    DROP CONSTRAINT IF EXISTS clubs_sport_check;

ALTER TABLE public.clubs 
    ADD CONSTRAINT clubs_sport_check 
    CHECK (sport IN (
        'rugby', 'football', 'tennis', 'basketball', 'hockey', 'volleyball', 
        'handball', 'baseball', 'american-football', 'field-hockey', 'cricket', 
        'snooker', 'table-tennis', 'darts', 'futsal', 'esports', 'golf', 
        'floorball', 'bandy', 'rugby-union', 'rugby-league', 'boxing', 
        'beach-volleyball', 'aussie-rules', 'badminton', 'water-polo', 
        'beach-soccer', 'mma', 'netball', 'pesapallo', 'motorsport', 
        'cycling', 'horse-racing', 'winter-sports', 'kabaddi'
    ));

-- 3. Recargar caché de esquema (para PostgREST)
NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN public.clubs.sport IS 'Deporte principal del club (normalizado)';
COMMENT ON COLUMN public.clubs.is_visible IS 'Si el club es visible públicamente (Legacy check)';
