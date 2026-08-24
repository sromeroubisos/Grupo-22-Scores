-- Rollback de 20260824120000_club_categorias_creadas_por_terceros.sql
--
-- OJO antes de correrlo: si ya se crearon categorías desde el Panel del Día,
-- las filas de `clubs` NO se borran acá y quedan como categorías normales, sin
-- rastro de quién las creó ni de que estaban esperando reclamo. Eso es a
-- propósito: borrar clubes que ya pueden tener partidos cargados es peor que
-- perder la trazabilidad.
--
-- Para ver qué se perdería, antes de correr esto:
--
--   SELECT c.id, c.name, c.claim_status, c.created_by_club_id
--   FROM public.clubs c
--   WHERE c.claim_status <> 'own'
--   ORDER BY c.created_at DESC;

BEGIN;

DROP INDEX IF EXISTS public.idx_clubs_claim_pendiente;

ALTER TABLE public.clubs
    DROP CONSTRAINT IF EXISTS clubs_claim_status_check;

ALTER TABLE public.clubs
    DROP COLUMN IF EXISTS claim_status,
    DROP COLUMN IF EXISTS created_by_user_id,
    DROP COLUMN IF EXISTS created_by_club_id;

NOTIFY pgrst, 'reload schema';

COMMIT;
