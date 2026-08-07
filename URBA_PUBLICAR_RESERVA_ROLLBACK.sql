-- Rollback de la publicación de los 22 torneos de reserva de 2026.
BEGIN;
UPDATE public.tournaments SET is_visible = FALSE, is_active = FALSE, status = 'draft'
  WHERE external_id IN ('');
COMMIT;
