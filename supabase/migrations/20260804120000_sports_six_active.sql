-- ============================================================
-- SEIS DEPORTES ACTIVOS
-- ============================================================
--
-- Deja visibles exactamente seis: rugby, futbol, basquet, hockey (cesped),
-- futbol americano y automovilismo. Todo el resto queda oculto.
--
-- AUTOSUFICIENTE A PROPOSITO. La primera version asumia que la migracion
-- 20260312000000_global_sports_config.sql ya habia corrido, y fallo con
-- `column "name_es" does not exist`: en la base real esa migracion nunca se
-- aplico. Por eso esta crea la tabla y agrega cada columna que necesita antes
-- de escribir. Es la misma defensa que ya hacia la consola de
-- /admin/super/deportes con su deteccion de columnas en runtime.
--
-- Ademas SIEMBRA el catalogo completo. La tabla tenia (a lo sumo) nueve filas,
-- asi que `field-hockey` y `motorsport` no existian y el super admin NO los
-- podia administrar: la consola hace UPDATE, nunca INSERT, y lo que no esta en
-- la tabla no se puede togglear. Con el catalogo completo sembrado, el super
-- admin pasa a poder prender o apagar CUALQUIER deporte sin tocar la base.
--
-- Espeja `src/lib/data/sports.ts` (is_visible = isActive, display_order =
-- priority). Los dos tienen que decir lo mismo: el codigo es el default del
-- primer paint y el que leen los crons de sync; esta tabla es la que manda en
-- el selector.
--
-- No borra nada. Los torneos, clubes y partidos de los deportes que se ocultan
-- siguen en la base intactos; solo dejan de ofrecerse en el selector. Revertir
-- un deporte es un toggle en la consola.

-- ── 1. La tabla, por si nunca se creo ────────────────────────
CREATE TABLE IF NOT EXISTS public.sports (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

-- ── 2. Las columnas que esta migracion escribe ───────────────
-- Cada una por separado y con IF NOT EXISTS: la tabla puede estar en
-- cualquier estado intermedio segun que migraciones se hayan aplicado.
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS name_es       TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS icon          TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_visible    BOOLEAN     DEFAULT true;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS display_order INTEGER     DEFAULT 100;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- ── 3. El catalogo ───────────────────────────────────────────
INSERT INTO public.sports (id, name, name_es, icon, display_order, is_visible)
VALUES
    -- Activos
    ('rugby',             'Rugby',              'Rugby',                 '🏉',  1, true),
    ('football',          'Football',           'Fútbol',                '⚽',  2, true),
    ('basketball',        'Basketball',         'Básquetbol',            '🏀',  3, true),
    ('field-hockey',      'Field Hockey',       'Hockey',                '🏑',  4, true),
    ('american-football', 'American Football',  'F. Am.',                '🏈',  5, true),
    ('motorsport',        'Motorsport',         'Automovilismo',         '🏎️',  6, true),

    -- Ocultos
    ('tennis',            'Tennis',             'Tenis',                 '🎾', 10, false),
    ('hockey',            'Ice Hockey',         'Hockey sobre hielo',    '🏒', 11, false),
    ('volleyball',        'Volleyball',         'Vóley',                 '🏐', 12, false),
    ('handball',          'Handball',           'Handball',              '🤾', 13, false),
    ('baseball',          'Baseball',           'Béisbol',               '⚾', 14, false),
    ('cricket',           'Cricket',            'Cricket',               '🏏', 15, false),
    ('snooker',           'Snooker',            'Snooker',               '🎱', 16, false),
    ('table-tennis',      'Table Tennis',       'T. Mesa',               '🏓', 17, false),
    ('darts',             'Darts',              'Dardos',                '🎯', 18, false),
    ('futsal',            'Futsal',             'Fútsal',                '⚽', 19, false),
    ('esports',           'Esports',            'Esports',               '🎮', 20, false),
    ('golf',              'Golf',               'Golf',                  '⛳', 21, false),
    ('floorball',         'Floorball',          'Floorball',             '🏑', 22, false),
    ('bandy',             'Bandy',              'Bandy',                 '🏒', 23, false),
    ('rugby-union',       'Rugby Union',        'Rugby Union',           '🏉', 24, false),
    ('rugby-league',      'Rugby League',       'Rugby League',          '🏉', 25, false),
    ('boxing',            'Boxing',             'Boxeo',                 '🥊', 26, false),
    ('beach-volleyball',  'Beach Volleyball',   'Voleibol de Playa',     '🏐', 27, false),
    ('aussie-rules',      'Australian Football','Fútbol Australiano',    '🏈', 28, false),
    ('badminton',         'Badminton',          'Bádminton',             '🏸', 29, false),
    ('water-polo',        'Water Polo',         'Waterpolo',             '🤽', 30, false),
    ('beach-soccer',      'Beach Soccer',       'Fútbol Playa',          '⚽', 31, false),
    ('mma',               'MMA',                'Artes Marciales Mixtas','🥋', 32, false),
    ('netball',           'Netball',            'Netball',               '🏀', 33, false),
    ('pesapallo',         'Pesäpallo',          'Pesäpallo',             '⚾', 34, false),
    ('cycling',           'Cycling',            'Ciclismo',              '🚴', 35, false),
    ('horse-racing',      'Horse Racing',       'Carreras de Caballos',  '🏇', 36, false),
    ('winter-sports',     'Winter Sports',      'Deportes de Invierno',  '⛷️', 37, false),
    ('kabaddi',           'Kabaddi',            'Kabaddi',               '🤸', 38, false)
ON CONFLICT (id) DO UPDATE SET
    name          = EXCLUDED.name,
    name_es       = COALESCE(public.sports.name_es, EXCLUDED.name_es),
    icon          = COALESCE(public.sports.icon, EXCLUDED.icon),
    display_order = EXCLUDED.display_order,
    is_visible    = EXCLUDED.is_visible,
    updated_at    = NOW();

-- ── 4. Red de seguridad ──────────────────────────────────────
-- Cualquier fila que exista y no este en el catalogo de arriba (un deporte
-- legacy, algo que entro por un import) queda oculta.
UPDATE public.sports
SET is_visible = false,
    updated_at = NOW()
WHERE id NOT IN (
    'rugby', 'football', 'basketball', 'field-hockey', 'american-football', 'motorsport'
)
AND is_visible IS DISTINCT FROM false;

-- ── 5. PostgREST tiene que ver las columnas nuevas ───────────
NOTIFY pgrst, 'reload schema';
