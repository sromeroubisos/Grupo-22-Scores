-- Escudos del Dos Orillas y del Regional M19 servidos desde public/ y no desde
-- Storage: salen con el deploy y no gastan requests a Supabase.
--
-- CORRER DESPUÉS DEL DEPLOY: antes, las rutas /clubs/<id>.png no existen en
-- producción y los escudos de estos clubes (incluidos los de mayores) salen rotos.
--
-- Las fichas juveniles apuntan al archivo de su madre: una sola imagen por club.
BEGIN;

UPDATE public.clubs SET logo_url = '/clubs/' || id || '.png', updated_at = now()
WHERE id IN ('santa-fe-r-c','crai','crar','estudiantes-de-parana','parana-rowing','club-tilcara',
  'la-salle-jobson','universitario-de-santa-fe','cha-roga-r-c','alma-juniors','atletico-brown-san-vicente',
  'querandi-r-c','san-carlos-r-c-santa-fe','jockey-club-de-rosario','duendes-r-c','atletico-del-rosario',
  'gimnasia-y-esgrima-de-rosario','old-resian-club','los-caranchos','jockey-club-de-venado-tuerto',
  'universitario-de-rosario');

UPDATE public.clubs f SET logo_url = '/clubs/' || m.madre || '.png', updated_at = now()
FROM (
  SELECT id, CASE WHEN id LIKE 'cha-roga-querandi-%' THEN 'cha-roga-r-c'
                  WHEN id LIKE 'brown-san-%' THEN 'atletico-brown-san-vicente'
                  ELSE regexp_replace(id, '-m1[5-9](-b)?$', '') END AS madre
  FROM public.clubs
  WHERE category IN ('M15','M16','M17','M19') AND id ~ '-m1[5-9](-b)?$'
) m
WHERE f.id = m.id
  AND m.madre IN ('santa-fe-r-c','crai','crar','estudiantes-de-parana','parana-rowing','club-tilcara',
  'la-salle-jobson','universitario-de-santa-fe','cha-roga-r-c','alma-juniors','atletico-brown-san-vicente',
  'querandi-r-c','san-carlos-r-c-santa-fe','jockey-club-de-rosario','duendes-r-c','atletico-del-rosario',
  'gimnasia-y-esgrima-de-rosario','old-resian-club','los-caranchos','jockey-club-de-venado-tuerto',
  'universitario-de-rosario');

UPDATE public.tournaments SET logo_url = '/competiciones/ar-trl-m19.png', updated_at = now()
WHERE slug IN ('torneo-regional-del-litoral-m19-a','torneo-regional-del-litoral-m19-b');

COMMIT;
