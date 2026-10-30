-- ============================================================
-- SIETE DEPORTES ACTIVOS: entra handball
-- ============================================================
--
-- Deja visibles exactamente siete: rugby, futbol, basquet, hockey (cesped),
-- futbol americano, handball y automovilismo. Todo el resto queda oculto,
-- tambien para el invitado, que es lo unico que ve el selector de la portada.
--
-- Continua 20260804120000_sports_six_active.sql. Aquella siembra el catalogo
-- completo y crea las columnas; esta solo mueve la visibilidad, asi que asume
-- la tabla ya sembrada. Igual repite los ALTER ... IF NOT EXISTS por si se
-- aplica sobre una base donde la anterior nunca corrio.
--
-- handball entra SIN proveedor externo. La puerta no esta en la base sino en
-- `SPORTS_WITHOUT_EXTERNAL_PROVIDER` (src/lib/externalProviderPolicy.ts): sin
-- ella los crons de sync lo pediran a FlashScore, que lo mapea al deporte 7, y
-- la portada mostraria handball del mundo entero que nadie cargo.
--
-- Espeja src/lib/data/sports.ts: is_visible = isActive, display_order =
-- priority. Los dos tienen que decir lo mismo. `motorsport` baja de 6 a 7
-- porque handball es equipo contra equipo y va con los otros seis; el
-- automovilismo es la excepcion de lectura y se queda ultimo.

-- ── 1. Columnas, por si esta base nunca vio la migracion anterior ──
CREATE TABLE IF NOT EXISTS public.sports (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS name_es       TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS icon          TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_visible    BOOLEAN     DEFAULT true;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS display_order INTEGER     DEFAULT 100;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- ── 2. Los siete visibles ────────────────────────────────────
-- INSERT ... ON CONFLICT y no UPDATE a secas: si la fila no existe (base sin
-- la migracion anterior), un UPDATE no escribe nada y el super admin se queda
-- sin poder togglear el deporte, porque la consola hace UPDATE y nunca INSERT.
INSERT INTO public.sports (id, name, name_es, icon, display_order, is_visible)
VALUES
    ('rugby',             'Rugby',              'Rugby',            '🏉', 1, true),
    ('football',          'Football',           'Fútbol',           '⚽', 2, true),
    ('basketball',        'Basketball',         'Básquetbol',       '🏀', 3, true),
    ('field-hockey',      'Field Hockey',       'Hockey',           '🏑', 4, true),
    ('american-football', 'American Football',  'F. Am.',           '🏈', 5, true),
    ('handball',          'Handball',           'Handball',         '🤾', 6, true),
    ('motorsport',        'Motorsport',         'Automovilismo',    '🏎️', 7, true)
ON CONFLICT (id) DO UPDATE SET
    name          = EXCLUDED.name,
    name_es       = COALESCE(public.sports.name_es, EXCLUDED.name_es),
    icon          = COALESCE(public.sports.icon, EXCLUDED.icon),
    display_order = EXCLUDED.display_order,
    is_visible    = true,
    updated_at    = NOW();

-- ── 3. Red de seguridad: todo lo demas, oculto ───────────────
-- Cubre tanto los deportes que ya estaban apagados como cualquier fila que
-- haya entrado despues por un import. No borra nada: los torneos, clubes y
-- partidos de esos deportes siguen intactos, solo dejan de ofrecerse.
UPDATE public.sports
SET is_visible = false,
    updated_at = NOW()
WHERE id NOT IN (
    'rugby', 'football', 'basketball', 'field-hockey',
    'american-football', 'handball', 'motorsport'
)
AND is_visible IS DISTINCT FROM false;

-- ── 4. PostgREST tiene que releer el esquema ─────────────────
NOTIFY pgrst, 'reload schema';
