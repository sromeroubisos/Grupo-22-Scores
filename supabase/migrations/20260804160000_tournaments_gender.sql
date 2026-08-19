-- Género del torneo.
--
-- Hasta ahora la distinción masculino/femenino vivía SÓLO en el string del nombre:
-- de los 83 torneos cargados, 15 se reconocen por el nombre y uno solo tenía algo
-- parecido a una marca en un campo. El motor de tablas nunca mezcló nada (las
-- posiciones se calculan por torneo y fase), pero no había forma de consultar ni
-- de restringir la rama, y la plataforma tiene hockey damas además de rugby.
--
-- NULLABLE Y SIN DEFAULT a propósito: lo no marcado es DESCONOCIDO, no masculino.
-- Un default masculino habría metido 68 suposiciones que nadie iba a volver a
-- revisar. Los que quedan en NULL se barren a mano.

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS gender TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tournaments_gender_check'
          AND conrelid = 'public.tournaments'::regclass
    ) THEN
        ALTER TABLE public.tournaments
            ADD CONSTRAINT tournaments_gender_check
            CHECK (gender IS NULL OR gender IN ('masculino', 'femenino', 'mixto'));
    END IF;
END $$;

COMMENT ON COLUMN public.tournaments.gender IS
    'masculino | femenino | mixto. NULL = sin determinar, NO asumir masculino. La sync de URBA lo setea explícitamente desde el nombre del torneo de origen; nunca se infiere por omisión.';

-- Backfill: sólo lo que el propio dato dice, por "femenino" o "damas" en el
-- nombre o en category. Son 15 filas (14 de hockey y SVNS 2 - Femenino de rugby).
--
-- Una de ellas, 'Campeonato Regional de Clubes A CENTRO CUYO - DAMAS', trae
-- category = 'Primers División Damas "A"' — con "Primers" en vez de "Primera".
-- El typo QUEDA COMO ESTÁ: se deja anotado acá y se corrige aparte si se decide,
-- pero una migración de género no es el lugar para tocar el nombre de otra cosa.
UPDATE public.tournaments
SET gender = 'femenino'
WHERE gender IS NULL
  AND (
    name ~* '(femenin|damas)'
    OR COALESCE(category, '') ~* '(femenin|damas)'
    OR COALESCE(age_grade, '') ~* '(femenin|damas)'
  );

-- El índice sirve para "traeme el femenino de este club/unión" sin escanear todo.
CREATE INDEX IF NOT EXISTS idx_tournaments_gender
    ON public.tournaments (gender)
    WHERE gender IS NOT NULL;

NOTIFY pgrst, 'reload schema';
