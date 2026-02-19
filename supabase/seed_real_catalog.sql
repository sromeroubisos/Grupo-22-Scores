-- ==============================================================================
-- SEMILLA CATALOGO REAL (Text IDs)
-- TIPO DE ID: TEXT (Para compatibilidad con API externa y Mock local)
-- ==============================================================================

-- 1. Limpiar tablas (Cuidado: borra datos existentes)
TRUNCATE TABLE public.matches CASCADE;
TRUNCATE TABLE public.clubs CASCADE;
TRUNCATE TABLE public.tournaments CASCADE;

-- 2. Asegurar Tipos de Datos (Camino 2: IDs como TEXT)
-- Clubs
DO $$ BEGIN
    ALTER TABLE public.clubs ALTER COLUMN id TYPE text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Tournaments
DO $$ BEGIN
    ALTER TABLE public.tournaments ALTER COLUMN id TYPE text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Matches (FKs)
DO $$ BEGIN
    ALTER TABLE public.matches ALTER COLUMN tournament_id TYPE text;
    ALTER TABLE public.matches ALTER COLUMN home_club_id TYPE text;
    ALTER TABLE public.matches ALTER COLUMN away_club_id TYPE text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. Insertar Torneos
INSERT INTO public.tournaments (id, name, sport, country, season_id, status)
VALUES 
('uar-top-12', 'URBA Top 12 Copa Star+', 'rugby', 'Argentina', '2026', 'published'),
('nacional-clubes', 'Torneo Nacional de Clubes', 'rugby', 'Argentina', '2026', 'draft');

-- 4. Insertar Clubes
INSERT INTO public.clubs (id, name, short_name, city, logo_url, union_id)
VALUES 
('sic', 'San Isidro Club', 'SIC', 'San Isidro', 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/San_Isidro_Club_logo.svg/1200px-San_Isidro_Club_logo.svg.png', 'uar'),
('casi', 'Club Atlético San Isidro', 'CASI', 'San Isidro', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/CASI_Logo.png/1200px-CASI_Logo.png', 'uar'),
('hindu', 'Hindu Club', 'HIN', 'Don Torcuato', 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9f/Hindu_Club_logo.svg/1200px-Hindu_Club_logo.svg.png', 'uar'),
('belgrano', 'Belgrano Athletic', 'BAC', 'CABA', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Belgrano_Athletic_Club_logo.svg/1200px-Belgrano_Athletic_Club_logo.svg.png', 'uar'),
('alumni', 'Alumni', 'ALU', 'Tortuguitas', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Asociaci%C3%B3n_Alumni_logo.svg/1200px-Asociaci%C3%B3n_Alumni_logo.svg.png', 'uar'),
('newman', 'Newman', 'NEW', 'Benavidez', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Club_Newman_logo.svg/1200px-Club_Newman_logo.svg.png', 'uar'),
('cuba', 'Club Universitario de Buenos Aires', 'CUBA', 'Villa de Mayo', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Club_Universitario_de_Buenos_Aires_logo.svg/1200px-Club_Universitario_de_Buenos_Aires_logo.svg.png', 'uar'),
('regatas', 'Regatas Bella Vista', 'REG', 'Bella Vista', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Club_de_Regatas_Bella_Vista_logo.svg/1200px-Club_de_Regatas_Bella_Vista_logo.svg.png', 'uar');

-- 5. Insertar Partidos
INSERT INTO public.matches (id, tournament_id, home_club_id, away_club_id, date_time, status, round_id)
VALUES 
('m1', 'uar-top-12', 'casi', 'sic', NOW() + INTERVAL '2 days', 'scheduled', 'F1'),
('m2', 'uar-top-12', 'hindu', 'belgrano', NOW() - INTERVAL '2 hours', 'live', 'F1'),
('m3', 'uar-top-12', 'newman', 'alumni', NOW() - INTERVAL '1 day', 'final', 'F1'),
('m4', 'uar-top-12', 'cuba', 'newman', NOW() + INTERVAL '3 days', 'scheduled', 'F1'),
('m5', 'uar-top-12', 'regatas', 'casi', NOW() + INTERVAL '4 days', 'scheduled', 'F1');
