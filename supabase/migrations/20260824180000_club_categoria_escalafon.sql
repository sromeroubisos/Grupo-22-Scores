-- El escalafón de la ficha de un club: a qué categoría representa.
--
-- El panel de una familia mezcla Primera, Intermedia y juveniles en la misma
-- jornada, y el horario no dice nada del nivel: la Intermedia juega antes que la
-- Primera porque comparten cancha. El orden que se lee es el del escalafón.
--
-- El RANGO es del sistema y el NOMBRE es del club: "Intermedia" (URBA, Córdoba)
-- y "Reserva" son el mismo escalón, y un club puede llamar "Los Pumitas" a su
-- Reserva. Por eso la clave que se guarda acá es canónica y corta, y el nombre
-- visible sigue viviendo en `clubs.name` / `clubs.short_name`.
--
-- Las dos columnas admiten NULL a propósito: NULL significa "todavía nadie lo
-- eligió" y el código lo infiere del nombre (`resolveCategoryLevel`). Así las
-- 201 fichas que ya existen quedan ordenadas sin que nadie toque nada, y el
-- selector solo hace falta cuando la inferencia se equivoca.

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS category_level text,
    ADD COLUMN IF NOT EXISTS category_variant text;

COMMENT ON COLUMN public.clubs.category_level IS
    'Rango canónico en el escalafón del club: primera | reserva | pre-reserva | m14..m23. NULL = se infiere del nombre. Ver src/lib/clubs/categoryLevel.ts.';

COMMENT ON COLUMN public.clubs.category_variant IS
    'Nominación dentro del rango: A, B, C... Ordena DENTRO de su rango, nunca lo cambia (Primera "B" va antes que la Reserva). NULL = se infiere del nombre.';

-- La clave se valida acá y no solo en el código: una fila escrita por un script
-- con "cadetes" dejaría la ficha sin orden y el bug aparecería en pantalla, lejos
-- de donde se escribió.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clubs_category_level_valido'
    ) THEN
        ALTER TABLE public.clubs
            ADD CONSTRAINT clubs_category_level_valido
            CHECK (
                category_level IS NULL
                OR category_level IN ('primera', 'reserva', 'pre-reserva')
                OR category_level ~ '^m(1[3-9]|2[0-3])$'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clubs_category_variant_valido'
    ) THEN
        ALTER TABLE public.clubs
            ADD CONSTRAINT clubs_category_variant_valido
            CHECK (category_variant IS NULL OR category_variant ~ '^[A-Z]$');
    END IF;
END $$;
