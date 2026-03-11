-- ============================================================
-- FIX: Agregar columna 'sport' a la tabla clubs
-- Ejecutar este script en Supabase Studio > SQL Editor
-- ============================================================

-- Agregar columna sport a clubs con valor por defecto 'rugby'
ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'rugby'
    CHECK (sport IN (
        'rugby',
        'football',
        'tennis',
        'basketball',
        'hockey',
        'volleyball',
        'handball',
        'baseball',
        'american-football',
        'field-hockey',
        'cricket',
        'snooker',
        'table-tennis',
        'darts',
        'futsal',
        'esports',
        'golf',
        'floorball',
        'bandy',
        'rugby-union',
        'rugby-league',
        'boxing',
        'beach-volleyball',
        'aussie-rules',
        'badminton',
        'water-polo',
        'beach-soccer',
        'mma',
        'netball',
        'pesapallo',
        'motorsport',
        'cycling',
        'horse-racing',
        'winter-sports',
        'kabaddi'
    ));

-- Verificar que la columna se creó correctamente
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'clubs' AND column_name = 'sport';
