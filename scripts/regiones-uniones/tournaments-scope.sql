-- Etapa B2: qué torneos son REGIONALES (los juegan clubes de más de una unión).
--
-- ADITIVO: agrega una columna NULLABLE y marca 29 torneos. No toca `union_id`
-- (quién organiza) ni nada existente.
--
-- Por qué una columna y no derivarlo de los clubes: la unión de cada club en la base
-- está desordenada (asociaciones de hockey, ARUSA, clubes "sin unión"), así que
-- contar uniones de los participantes da números inflados e inestables. Qué
-- torneo es regional es una decisión editorial y se guarda como dato.
--
-- Valores: 'union' (lo organiza y lo juega una unión), 'regional' (varias uniones de
-- una región), 'nacional' (todo el país). NULL se lee como 'union'.
-- La región de un regional sale de la unión organizadora (`unions.region_code`).
--
-- Rollback al final del archivo.

begin;

alter table public.tournaments add column if not exists scope text;

alter table public.tournaments drop constraint if exists tournaments_scope_chk;
alter table public.tournaments add constraint tournaments_scope_chk
  check (scope is null or scope in ('union', 'regional', 'nacional'));

-- Sólo marca los que están vacíos: correrlo dos veces, o después de que alguien
-- cargó un valor a mano, no pisa nada. Se matchea por (unión, nombre) EXACTO.
update public.tournaments t
   set scope = 'regional'
  from (values
    -- Centro (Unión Cordobesa)
    ('0c515ac1-af49-4699-b3c5-7273bc424357', 'Regional Centro "A"'),
    ('0c515ac1-af49-4699-b3c5-7273bc424357', 'Regional Centro "B"'),
    ('0c515ac1-af49-4699-b3c5-7273bc424357', 'Regional Centro "B" - Intermedia'),
    ('0c515ac1-af49-4699-b3c5-7273bc424357', 'Torneo Regional del Centro Femenino'),
    -- Cuyo (Unión de Rugby de Cuyo)
    ('40159cd1-5876-4720-b953-d639b09d5f5b', 'Copa Oro del Oeste'),
    ('40159cd1-5876-4720-b953-d639b09d5f5b', 'Copa Plata del Oeste'),
    ('40159cd1-5876-4720-b953-d639b09d5f5b', 'Copa Bronce del Oeste'),
    -- Litoral (Unión de Rugby de Rosario)
    ('a37639f8-197c-44c6-a095-2f16f40d7b04', 'Torneo Regional del Litoral "A"'),
    ('a37639f8-197c-44c6-a095-2f16f40d7b04', 'Torneo Regional Del Litoral "B"'),
    -- Litoral (Unión Santafesina)
    ('union-santafesina-de-rugby', 'Torneo Juvenil Dos Orillas M15'),
    ('union-santafesina-de-rugby', 'Torneo Juvenil Dos Orillas M16'),
    ('union-santafesina-de-rugby', 'Torneo Juvenil Dos Orillas M17'),
    ('union-santafesina-de-rugby', 'Torneo Juvenil Dos Orillas M19'),
    ('union-santafesina-de-rugby', 'Torneo Regional del Litoral M19 "A"'),
    ('union-santafesina-de-rugby', 'Torneo Regional del Litoral M19 "B"'),
    -- NOA (Unión de Rugby de Tucumán)
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c', 'Torneo Regional del NOA "A"'),
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c', 'Torneo Regional del NOA "A" - Intermedia'),
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c', 'Torneo Regional del NOA "B"'),
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c', 'Torneo Regional del NOA "B" - Intermedia'),
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c', 'Torneo Regional del NOA "C" - Primera'),
    ('e558d0d9-c01b-40ce-a1c7-e533cb81f97c', 'Torneo Regional del NOA "C" - Intermedia'),
    -- NEA (URNE)
    ('urne', 'Torneo Regional del NEA'),
    ('urne', 'Torneo Regional del NEA Ascenso'),
    -- Pampeana (Mar del Plata y Del Sur)
    ('union-de-rugby-de-mar-del-plata', 'Torneo Regional Pampeano'),
    ('union-de-rugby-de-mar-del-plata', 'Torneo Regional Pampeano B'),
    ('union-de-rugby-del-sur', 'Torneo Norpatagónico'),
    -- Patagonia (Alto Valle)
    ('union-de-rugby-de-alto-valle', 'Torneo Regional Patagónico'),
    -- Regionales de UNA sola provincia: son el regional de su región aunque los
    -- juegue una unión. Se ven en la unión y en el bloque "Regionales" de la región.
    ('0c515ac1-af49-4699-b3c5-7273bc424357', 'Top 10 del Centro'),   -- Córdoba
    ('urba', 'Top 14 de la URBA')                                    -- Buenos Aires
  ) as v(union_id, name)
 where t.union_id = v.union_id
   and t.name = v.name
   and t.sport_id = 'rugby'
   and t.scope is null;

-- Control: tiene que dar 29 (si da menos, algún nombre cambió).
select count(*) as marcados_regional
  from public.tournaments
 where scope = 'regional';

commit;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- alter table public.tournaments drop constraint if exists tournaments_scope_chk;
-- alter table public.tournaments drop column if exists scope;
