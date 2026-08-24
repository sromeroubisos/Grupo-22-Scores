-- Revierte la vinculación de las categorías huérfanas de Club Newman.
-- Generado antes de aplicar. Filas afectadas: 27
BEGIN;
DELETE FROM public.club_derivatives
WHERE base_club_id = 'club-newman'
  AND derived_club_id IN ('club-newman-m15-a', 'club-newman-m15-b', 'club-newman-m15-c', 'club-newman-m15-d', 'club-newman-m16-a', 'club-newman-m16-b', 'club-newman-m16-c', 'club-newman-m16-d', 'club-newman-m17-c', 'club-newman-m18-a', 'club-newman-m18-b', 'club-newman-m19-b', 'club-newman-m19-c', 'club-newman-m19-d', 'club-newman-m19-e', 'club-newman-m20-a', 'club-newman-m20-b', 'club-newman-m22', 'newman-intermedia', 'newman-preintermedia', 'newman-preintermedia-b', 'newman-preintermedia-c', 'newman-preintermedia-d', 'newman-preintermedia-e', 'newman-preintermedia-f', 'newman-preintermedia-g', 'newman-preintermedia-h');
COMMIT;
