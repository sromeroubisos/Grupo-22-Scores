-- Rollback de la reparación de San Andrés. Generado ANTES de ejecutar.
-- Devuelve los registros exactamente al estado previo.
--
-- El porqué de la reparación está en docs/urba-club-id-14.md.

BEGIN;

-- 1. Deshacer los renombres (mapeo primero, para no dejar la FK colgando)
DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '31|M19|';
UPDATE public.clubs SET id = 'san-albano-m19', name = 'san albano m19', short_name = 'san albano m19', slug = 'san-albano-m19',
       logo_url = 'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanalbano.png'
  WHERE id = 'san-andres-m19';
INSERT INTO public.club_external_ids (provider, external_id, club_id) VALUES ('urba', '14|M19|', 'san-albano-m19');
DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '31|M20|A';
UPDATE public.clubs SET id = 'san-albano-m20-a', name = 'san albano m20 a', short_name = 'san albano m20 a', slug = 'san-albano-m20-a',
       logo_url = 'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanalbano.png'
  WHERE id = 'san-andres-m20-a';
INSERT INTO public.club_external_ids (provider, external_id, club_id) VALUES ('urba', '14|M20|A', 'san-albano-m20-a');
DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '31|M20|B';
UPDATE public.clubs SET id = 'san-albano-m20-b', name = 'san albano m20 b', short_name = 'san albano m20 b', slug = 'san-albano-m20-b',
       logo_url = 'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanalbano.png'
  WHERE id = 'san-andres-m20-b';
INSERT INTO public.club_external_ids (provider, external_id, club_id) VALUES ('urba', '14|M20|B', 'san-albano-m20-b');

-- OJO: el UPDATE de arriba restituye el `name` con guiones. Los nombres exactos eran:
--   san-albano-m19 -> 'San Albano M19'
--   san-albano-m20-a -> 'San Albano M20 "A"'
--   san-albano-m20-b -> 'San Albano M20 "B"'

-- 2. Reponer el duplicado retirado
INSERT INTO public.clubs (id, union_id, name, short_name, slug, logo_url, is_visible, entity_type, sport, category, status, visibility)
  VALUES ('san-albano-m15-c', 'urba', 'San Albano M15 "C"', 'San Albano M15 "C"', 'san-albano-m15-c',
          'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanalbano.png', FALSE, 'club', 'rugby', 'M15', 'active', 'hidden');
INSERT INTO public.club_external_ids (provider, external_id, club_id) VALUES ('urba', '14|M15|C', 'san-albano-m15-c');

-- 3. Borrar los creados
DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '31|M15|';
DELETE FROM public.clubs WHERE id = 'san-andres-m15';
DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '31|M18|A';
DELETE FROM public.clubs WHERE id = 'san-andres-m18-a';
DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '31|M18|B';
DELETE FROM public.clubs WHERE id = 'san-andres-m18-b';

COMMIT;
