-- stg_urba_vinculaciones — parte 2 de 2
-- Origen: vinculaciones.csv (filas 401 a 426 de 426)
--
-- INSERT ... VALUES puro: ejecutable tal cual en el editor SQL del dashboard.
-- ON CONFLICT DO NOTHING: reintentar esta parte no se cae por duplicados.
-- Correr las partes EN ORDEN y verificar el count al final de cada una.

BEGIN;

INSERT INTO public.stg_urba_vinculaciones (provider, external_id, club_id, urba_club_id, categoria, sufijo, confidence, nivel, urba_institucion, urba_nombre_equipo, g22_nombre, g22_union, anios, veces) VALUES
  ('urba', '1|preintermedia|E', 'san-isidro-club', 1, 'preintermedia', 'E', 'exacto', 'institucion', 'SIC', 'SIC E', 'San Isidro Club', 'urba', '2022 2023 2024 2025 2026', 5),
  ('urba', '1|preintermedia|F', 'san-isidro-club', 1, 'preintermedia', 'F', 'exacto', 'institucion', 'SIC', 'SIC F', 'San Isidro Club', 'urba', '2023 2025 2026', 3),
  ('urba', '1|preintermedia|G', 'san-isidro-club', 1, 'preintermedia', 'G', 'exacto', 'institucion', 'SIC', 'SIC G', 'San Isidro Club', 'urba', '2025 2026', 2),
  ('urba', '43|femenino|', 'sitas', 43, 'femenino', '', 'exacto', 'institucion', 'SITAS', 'SITAS', 'SITAS', 'urba', '2021 2022 2023 2024 2025 2026', 9),
  ('urba', '43|intermedia|', 'sitas', 43, 'intermedia', '', 'exacto', 'institucion', 'SITAS', 'SITAS', 'SITAS', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '43|mayores|', 'sitas', 43, 'mayores', '', 'exacto', 'institucion', 'SITAS', 'SITAS', 'SITAS', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '43|mayores|B', 'sitas', 43, 'mayores', 'B', 'exacto', 'institucion', 'SITAS', 'SITAS B', 'SITAS', 'urba', '2025', 1),
  ('urba', '43|preintermedia|', 'sitas', 43, 'preintermedia', '', 'exacto', 'institucion', 'SITAS', 'SITAS', 'SITAS', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '43|preintermedia|B', 'sitas', 43, 'preintermedia', 'B', 'exacto', 'institucion', 'SITAS', 'SITAS B', 'SITAS', 'urba', '2022 2023 2024 2026', 4),
  ('urba', '58|intermedia|', 'st-brendan-s', 58, 'intermedia', '', 'exacto', 'institucion', 'St. Brendans', 'St. Brendans', 'St. Brendan''s', 'urba', '2022 2023 2024 2025 2026', 5),
  ('urba', '58|mayores|', 'st-brendan-s', 58, 'mayores', '', 'exacto', 'institucion', 'St. Brendans', 'St. Brendans', 'St. Brendan''s', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '58|preintermedia|', 'st-brendan-s', 58, 'preintermedia', '', 'exacto', 'institucion', 'St. Brendans', 'St. Brendans', 'St. Brendan''s', 'urba', '2022 2023 2025 2026', 4),
  ('urba', '29|femenino|', 'universitario-de-la-plata', 29, 'femenino', '', 'exacto', 'institucion', 'Universitario de la Plata', 'Universitario de La Plata', 'Universitario de La Plata', 'urba', '2021 2022 2026', 4),
  ('urba', '29|intermedia|', 'universitario-de-la-plata', 29, 'intermedia', '', 'exacto', 'institucion', 'Universitario de la Plata', 'Universitario de La Plata', 'Universitario de La Plata', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '29|mayores|', 'universitario-de-la-plata', 29, 'mayores', '', 'exacto', 'institucion', 'Universitario de la Plata', 'Universitario de La Plata', 'Universitario de La Plata', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '29|preintermedia|', 'universitario-de-la-plata', 29, 'preintermedia', '', 'exacto', 'institucion', 'Universitario de la Plata', 'Universitario de La Plata', 'Universitario de La Plata', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '29|preintermedia|B', 'universitario-de-la-plata', 29, 'preintermedia', 'B', 'exacto', 'institucion', 'Universitario de la Plata', 'Universitario de la Plata B', 'Universitario de La Plata', 'urba', '2022 2024 2025 2026', 4),
  ('urba', '45|intermedia|', 'vicentinos', 45, 'intermedia', '', 'exacto', 'institucion', 'Vicentinos', 'Vicentinos', 'Vicentinos', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '45|mayores|', 'vicentinos', 45, 'mayores', '', 'exacto', 'institucion', 'Vicentinos', 'Vicentinos', 'Vicentinos', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '45|mayores|B', 'vicentinos', 45, 'mayores', 'B', 'exacto', 'institucion', 'Vicentinos', 'Vicentinos B', 'Vicentinos', 'urba', '2025', 1),
  ('urba', '45|preintermedia|', 'vicentinos', 45, 'preintermedia', '', 'exacto', 'institucion', 'Vicentinos', 'Vicentinos', 'Vicentinos', 'urba', '2022 2023 2024 2025 2026', 5),
  ('urba', '45|preintermedia|B', 'vicentinos', 45, 'preintermedia', 'B', 'exacto', 'institucion', 'Vicentinos', 'Vicentinos B', 'Vicentinos', 'urba', '2026', 1),
  ('urba', '55|intermedia|', 'virreyes-r-c', 55, 'intermedia', '', 'exacto', 'institucion', 'Virreyes', 'Virreyes', 'VIrreyes R.C.', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '55|mayores|', 'virreyes-r-c', 55, 'mayores', '', 'exacto', 'institucion', 'Virreyes', 'Virreyes', 'VIrreyes R.C.', 'urba', '2021 2022 2023 2024 2025 2026', 6),
  ('urba', '55|preintermedia|', 'virreyes-r-c', 55, 'preintermedia', '', 'exacto', 'institucion', 'Virreyes', 'Virreyes', 'VIrreyes R.C.', 'urba', '2022 2025 2026', 3),
  ('urba', '55|preintermedia|B', 'virreyes-r-c', 55, 'preintermedia', 'B', 'exacto', 'institucion', 'Virreyes', 'Virreyes B', 'VIrreyes R.C.', 'urba', '2026', 1)
ON CONFLICT DO NOTHING;

COMMIT;

-- VERIFICACIÓN DE ESTA PARTE
-- SELECT count(*) FROM public.stg_urba_vinculaciones;
-- esperado acumulado tras la parte 2: 426
-- TABLA COMPLETA.
