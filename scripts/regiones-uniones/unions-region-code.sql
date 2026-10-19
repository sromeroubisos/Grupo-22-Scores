-- Etapa B del rediseño de navegación: la región de cada unión.
--
-- ADITIVO: agrega una columna NULLABLE y la completa. No toca `tournaments.region`
-- (sucia, y nadie la va a leer desde el selector) ni borra nada.
--
-- Por qué en `unions` y no en `tournaments`: la región es del organizador, no de
-- cada edición. En `tournaments.region` hoy conviven 'Pampeano' y 'Pampeana', y
-- Mendoza y San Juan figuran como 'Sudamérica'.
--
-- Valores permitidos (el CHECK los fija, para que no vuelva a pasar):
--   nacional | amba | pampeana | centro | litoral | noa | nea | cuyo | patagonia
-- NULL = sin región (uniones de otros países, confederaciones internacionales).
--
-- Rollback al final del archivo.

begin;

alter table public.unions add column if not exists region_code text;

alter table public.unions drop constraint if exists unions_region_code_chk;
alter table public.unions add constraint unions_region_code_chk
  check (region_code is null or region_code in
    ('nacional','amba','pampeana','centro','litoral','noa','nea','cuyo','patagonia'));

-- Sólo completa las que están vacías: correrlo dos veces, o después de que
-- alguien cargó una región a mano, no pisa nada.
update public.unions u
   set region_code = v.region_code
  from (values
    -- Nacional
    ('union-argentina-de-rugby',                                'nacional'),
    ('confederacion-argentina-de-hockey',                       'nacional'),
    -- AMBA
    ('urba',                                                    'amba'),
    ('asociacion-amateur-de-hockey-sobre-cesped-buenos-aires',  'amba'),
    -- Pampeana
    ('union-de-rugby-de-mar-del-plata',                         'pampeana'),
    ('union-de-rugby-del-sur',                                  'pampeana'),   -- duda 2
    ('uroba',                                                   'pampeana'),   -- duda 3
    ('asociacion-amateur-marplatense-de-hockey',                'pampeana'),
    -- Centro
    ('0c515ac1-af49-4699-b3c5-7273bc424357',                    'centro'),     -- Unión Cordobesa
    ('federacion-cordobesa-de-hockey',                          'centro'),     -- duda 5
    -- Litoral
    ('union-santafesina-de-rugby',                              'litoral'),
    ('a37639f8-197c-44c6-a095-2f16f40d7b04',                    'litoral'),    -- Unión de Rugby de Rosario
    ('union-entrerriana-de-rugby',                              'litoral'),
    ('asociacion-de-hockey-del-litoral',                        'litoral'),
    -- NOA
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c',                    'noa'),        -- Unión de Rugby de Tucumán
    ('4263f793-04d6-4dd9-9b43-b7e9823bf721',                    'noa'),        -- Unión de Rugby de Salta
    ('union-santiaguena-de-rugby',                              'noa'),
    ('asociacion-tucumana-amateur-de-hockey',                   'noa'),
    -- NEA
    ('urne',                                                    'nea'),
    ('union-de-rugby-de-formosa',                               'nea'),
    ('union-de-rugby-de-misiones',                              'nea'),
    -- Centro: la Andina coordina con la Unión Cordobesa los torneos regionales.
    ('union-andina-de-rugby',                                   'centro'),
    -- Cuyo
    ('40159cd1-5876-4720-b953-d639b09d5f5b',                    'cuyo'),       -- Unión de Rugby de Cuyo
    ('765e6c46-b1c1-4e44-8490-aa0085ebeb99',                    'cuyo'),       -- Unión Sanjuanina
    ('asociacion-mendocina-de-hockey-sobre-cesped',             'cuyo'),
    -- Patagonia
    ('union-austral',                                           'patagonia'),
    ('union-de-rugby-de-alto-valle',                            'patagonia'),
    ('union-de-rugby-del-valle-del-chubut',                     'patagonia'),
    ('union-de-rugby-de-tierra-del-fuego',                      'patagonia')
  ) as v(id, region_code)
 where u.id = v.id
   and u.region_code is null;

-- Control: cuántas quedaron cargadas.
select count(*) filter (where region_code is not null) as con_region,
       count(*) as total
  from public.unions;

commit;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- alter table public.unions drop constraint if exists unions_region_code_chk;
-- alter table public.unions drop column if exists region_code;
