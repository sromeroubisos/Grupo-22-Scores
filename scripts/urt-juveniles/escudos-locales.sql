-- Escudos de los clubes de Tucumán y de sus fichas juveniles servidos desde
-- public/clubs (estándar de Recursos/ARGENTINA/NOA), no desde Storage.
--
-- CORRER DESPUÉS DEL DEPLOY: antes, las rutas /clubs/<id>.png no existen en
-- producción y los escudos de estos clubes (también los de mayores) salen rotos.
-- Liceo Rugby Club (Tucumán) no tiene escudo: queda con las iniciales.
BEGIN;

UPDATE public.clubs SET logo_url = '/clubs/' || id || '.png', updated_at = now()
WHERE id IN ('aguara-guazu','cardenales-r-c','coipu-r-c','huirapuca','jockey-club-de-tucuman','la-querencia',
  'lince-rugby-club','los-tarcos','natacion-y-gimnasia','tucuman-lawn-tennis','tucuman-rugby-club',
  'universitario-de-tucuman','san-martin-rugby-club-tucuman');

-- Fichas: <madre>[-color]-m1x[-b] → el archivo de la madre.
UPDATE public.clubs f SET logo_url = '/clubs/' || m.id || '.png', updated_at = now()
FROM public.clubs m
WHERE m.id IN ('aguara-guazu','cardenales-r-c','coipu-r-c','huirapuca','jockey-club-de-tucuman','la-querencia',
  'lince-rugby-club','los-tarcos','natacion-y-gimnasia','tucuman-lawn-tennis','tucuman-rugby-club',
  'universitario-de-tucuman','san-martin-rugby-club-tucuman')
  AND f.id ~ ('^' || m.id || '(-(verde|negro|azul|blanco|gris))?-m1[5-9](-b)?$');

COMMIT;
