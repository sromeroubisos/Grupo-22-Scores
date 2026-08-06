-- Rollback del pais/region de los 126 torneos de URBA.
-- Los deja como estaban: NULL. Los 8 originales ya tenian Argentina y no se tocan.

UPDATE public.tournaments SET country = NULL, country_id = NULL, region = NULL
WHERE external_id LIKE 'urba:%' AND id NOT IN (
  SELECT id FROM public.tournaments
  WHERE external_id IN ('urba:2025176','urba:2025177','urba:2025178','urba:2025179',
                        'urba:2025213','urba:2025215','urba:2025231','urba:2025233')
);
-- esperado: 126 filas
