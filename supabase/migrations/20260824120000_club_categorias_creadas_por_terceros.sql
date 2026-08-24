BEGIN;

-- Categorías de club creadas por otro club.
--
-- El Panel del Día deja que un club cargue un partido contra una categoría del
-- rival —"Jockey M15"—, y esa categoría puede no existir todavía. La decisión
-- tomada es crearla REAL: una fila en `clubs` colgada de Jockey por
-- `club_derivatives`, con ficha pública, historial y la posibilidad de seguirla.
-- No un texto suelto en el catálogo privado de quien la cargó.
--
-- Lo que falta para eso son dos datos que `clubs` no tiene: quién la creó y si
-- su dueño ya la tomó. Sin ellos no hay bandeja de reclamo posible, y una
-- categoría creada por un tercero sería indistinguible de una propia.
--
--   own      → la creó su propio club, o un admin. Es el caso de TODO lo que ya
--              está en la base, y por eso es el default.
--   proposed → la creó otro club para poder cargar un partido. Funciona igual
--              que cualquier club, pero aparece en la bandeja de su dueño.
--   claimed  → el dueño la tomó y ya pudo renombrarla.
--
-- Renombrar es gratis: los partidos apuntan al `id`, no al nombre. Lo caro es
-- fusionar dos categorías gemelas, y por eso el control de duplicados va en el
-- alta y no acá.

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS created_by_club_id TEXT NULL
        REFERENCES public.clubs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL
        REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'own';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clubs_claim_status_check'
          AND conrelid = 'public.clubs'::regclass
    ) THEN
        ALTER TABLE public.clubs
            ADD CONSTRAINT clubs_claim_status_check
            CHECK (claim_status IN ('own', 'proposed', 'claimed'));
    END IF;
END $$;

-- La bandeja de reclamo de un club pregunta siempre lo mismo: "¿qué categorías
-- me crearon y todavía no tomé?". Un índice parcial, porque las `own` son el
-- 100% del catálogo actual y no interesan para esa consulta.
CREATE INDEX IF NOT EXISTS idx_clubs_claim_pendiente
    ON public.clubs (created_by_club_id, claim_status)
    WHERE claim_status = 'proposed';

COMMENT ON COLUMN public.clubs.created_by_club_id IS 'Club que dio de alta esta categoría, cuando la creó un tercero desde el Panel del Día.';
COMMENT ON COLUMN public.clubs.created_by_user_id IS 'Usuario que dio de alta esta categoría.';
COMMENT ON COLUMN public.clubs.claim_status IS 'own | proposed | claimed. Una categoría proposed la creó otro club y espera que su dueño la reclame.';

NOTIFY pgrst, 'reload schema';

COMMIT;
