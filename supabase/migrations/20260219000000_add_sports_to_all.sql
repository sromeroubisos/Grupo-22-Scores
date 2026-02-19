-- ============================================================
-- G22 SCORES - Deportes completos (sincronizado con FlashScore)
-- ============================================================
-- Incluye todos los deportes del API de FlashScore que el sistema soporta.
-- Los IDs de deporte se alinean con los slugs del API (sin barras).

-- Lista completa de sport IDs válidos (usada en múltiples constraints)
-- rugby, football, tennis, basketball, hockey, volleyball, handball, baseball,
-- american-football, field-hockey, cricket, snooker, table-tennis, darts,
-- futsal, esports, golf, floorball, bandy, rugby-union, rugby-league, boxing,
-- beach-volleyball, aussie-rules, badminton, water-polo, beach-soccer, mma,
-- netball, pesapallo, motorsport, cycling, horse-racing, winter-sports, kabaddi

-- ============================================================
-- 1. AMPLIAR CONSTRAINT DE DEPORTE EN TOURNAMENTS
-- ============================================================

-- Eliminar constraint existente (nombre generado automáticamente por Postgres)
ALTER TABLE public.tournaments
    DROP CONSTRAINT IF EXISTS tournaments_sport_check;

-- Agregar constraint nueva con todos los deportes
ALTER TABLE public.tournaments
    ADD CONSTRAINT tournaments_sport_check CHECK (sport IN (
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

-- ============================================================
-- 2. AGREGAR COLUMNA DEPORTE A CLUBS
-- ============================================================

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

-- Actualizar RLS policy de clubs si no existe lectura pública
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'clubs' AND policyname = 'Public Read Clubs'
    ) THEN
        ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Public Read Clubs" ON public.clubs FOR SELECT USING (true);
    END IF;
END $$;
