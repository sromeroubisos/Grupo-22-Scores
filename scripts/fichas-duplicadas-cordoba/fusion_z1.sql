
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('301f54de-3414-4f8d-84e2-c5ef99a504a2'::uuid, '176a20cf-4d63-40da-a01c-14118a986a85'::uuid),
('4cc451ea-b1c0-4550-aed9-1222027df123'::uuid, '3d37da0a-45f0-43f3-a1d0-4a8a65c4f0e3'::uuid),
('72acdd7f-5e4c-47fd-baf5-924bb009d1da'::uuid, '9c24df82-2256-4c13-a02a-302dada927f2'::uuid),
('9152c046-664b-4880-803b-c247c320b848'::uuid, '9a964e23-afdc-4d4b-88eb-1fb6d404e377'::uuid),
('64ecb4c1-6a1e-4324-bbe5-5ed68b4f7f13'::uuid, '1c56c260-da20-4866-8ce4-38789d293cb6'::uuid),
('509e7579-595c-4795-b43d-e1636687bbe0'::uuid, 'e3174daa-c7f7-491b-9fcd-09e232731847'::uuid),
('b80f8b7c-eba9-4612-b08e-ac61dc918e4a'::uuid, '2fce91dc-ff2b-420f-9367-709eace39245'::uuid),
('a57f6c98-adf7-4797-8077-2d4834d3b852'::uuid, '74d6c246-baa7-4580-b255-0c75a70f70c2'::uuid),
('98fcfb8a-2601-4bd9-abdd-919c51dd6671'::uuid, 'b8b30f52-e044-4b7b-82ad-4cc21b1068a6'::uuid),
('3225aa01-c37d-43c5-b70b-b4c3eb911acb'::uuid, '9df6f117-48af-4f61-bad3-e5e54f4c45e4'::uuid),
('694e0db2-1d34-494c-bac1-fa13dbd55f05'::uuid, '086ffdc8-6850-43db-bccc-54d4e0cd5ff6'::uuid),
('f00cb7f9-cf78-460f-9aca-3ae78e0de2e3'::uuid, 'd9e8eb20-619e-4121-9245-3bb36e8b7ae6'::uuid),
('81d8e20b-511d-4f6a-8af0-86b02a0961ae'::uuid, 'f6e19b27-12f8-42e6-9d4d-a2ee9cc445ca'::uuid),
('896e0f92-7d89-4b4f-84ef-dde9d33d2ed2'::uuid, 'c507c8a4-b3bd-4ac8-b143-ef3f21c86ed0'::uuid),
('878a9903-5610-4eb0-a4fe-6bf16ec0837d'::uuid, 'a1fca0b6-af74-4511-a376-4ddadf31d1dd'::uuid),
('2ccdcf06-5ad6-41bb-b8f4-993c08ce56fa'::uuid, '9f9d3d66-f507-4186-a20f-5bf2604586ab'::uuid),
('e9eaf3f6-b8cb-4757-86ad-ea59c4d2145f'::uuid, '1fbe0634-734d-423f-9529-919a529cdaab'::uuid),
('3923514d-c9e4-4dbc-a0ac-14fd43ecdfcb'::uuid, 'e3fa39ab-d558-4a88-bfcb-fa09a1b9397c'::uuid),
('1b8982b2-ae8a-4411-aa5a-4b7bf8cea3bb'::uuid, '9b04f78e-ef7a-4758-934d-37161406688d'::uuid),
('3aec989d-510a-480b-9c79-b4604994139e'::uuid, '4a937e10-ecdf-4dbc-b577-966402b6b568'::uuid),
('6f19d7f8-b30d-4214-bec4-97baada8ca20'::uuid, '41b98856-66c8-4eed-9a16-ca62af5acb1d'::uuid),
('0ca86463-872c-4bfc-a1e0-84aa193ffed7'::uuid, '350f0f90-da1a-4f47-a880-40002413e3cf'::uuid),
('d10ddfde-a9fe-425b-ad95-32d6a4a7a5f7'::uuid, 'b44ecc53-835d-4a8e-adb2-5e67cb9646ca'::uuid),
('a2474da5-29df-4d3a-ac92-5d12a63e96d6'::uuid, 'a5c1c05d-60e8-45c3-810f-16d965b35cf0'::uuid),
('34d90550-f77a-4f5e-82c4-6306101ccbb2'::uuid, 'adafdf53-769a-48dd-bd68-5e440e1904d9'::uuid),
('7792cb9f-ea26-42e0-b00c-830c36bb18f8'::uuid, '17788fff-7f05-4650-bd67-6fe0355f477f'::uuid),
('2929f2bb-0d4e-4cd7-a46b-7d7e00b4584a'::uuid, 'a24f0d21-a4f3-460d-85d6-d5c002fafec8'::uuid),
('29e882f0-30c1-477d-b3cb-ae6d45eaf088'::uuid, 'f7fe55de-7142-4f01-8c8e-74f28a5343a7'::uuid),
('e910642b-4ec6-4617-b866-b3eec8161cd0'::uuid, '39ca2d48-70f3-4384-be25-8d321ab286a2'::uuid),
('1ce2f2e8-960c-4f2a-b155-e7d5d4b06ba2'::uuid, '425adbe0-ee4b-4765-99ac-df148519a29f'::uuid),
('144f43c9-3577-4114-bffb-72634329e501'::uuid, 'dbfcfc9f-3ae1-4b1c-9ad8-668375fa2856'::uuid),
('e92d7b0d-d1f2-4193-b065-38996829e1be'::uuid, '90b78676-0839-49a3-a76a-0ded40fc1c23'::uuid),
('f920c6a7-e069-4841-a986-0c8fc027352f'::uuid, '90b78676-0839-49a3-a76a-0ded40fc1c23'::uuid),
('e655783d-7daa-4338-bada-49e795c65799'::uuid, '3dae09f4-734b-4ef7-8ee7-afda6941e5d4'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('176a20cf-4d63-40da-a01c-14118a986a85'::uuid, 'Estanislao Pregot Holmquist', 'Estanislao Pregot', 'Holmquist'),
('3d37da0a-45f0-43f3-a1d0-4a8a65c4f0e3'::uuid, 'Joaquín Jose Aguilar Rico', 'Joaquín Jose Aguilar', 'Rico'),
('9c24df82-2256-4c13-a02a-302dada927f2'::uuid, 'Juan Pablo Pfister', 'Juan Pablo', 'Pfister'),
('9a964e23-afdc-4d4b-88eb-1fb6d404e377'::uuid, 'Máximo Ledesma Alfaro', 'Máximo Ledesma', 'Alfaro'),
('1c56c260-da20-4866-8ce4-38789d293cb6'::uuid, 'Miguel Roberto Mukdise', 'Miguel Roberto', 'Mukdise'),
('e3174daa-c7f7-491b-9fcd-09e232731847'::uuid, 'Nicolás Maria Macome', 'Nicolás Maria', 'Macome'),
('2fce91dc-ff2b-420f-9367-709eace39245'::uuid, 'Santiago Meliton Heredia', 'Santiago Meliton', 'Heredia'),
('74d6c246-baa7-4580-b255-0c75a70f70c2'::uuid, 'Lorenzo Matias Egea', 'Lorenzo Matias', 'Egea'),
('b8b30f52-e044-4b7b-82ad-4cc21b1068a6'::uuid, 'Ignacio Palillo Neri', 'Ignacio Palillo', 'Neri'),
('9df6f117-48af-4f61-bad3-e5e54f4c45e4'::uuid, 'Jorge Manuel Onorato Barrientos', 'Jorge Manuel Onorato', 'Barrientos'),
('086ffdc8-6850-43db-bccc-54d4e0cd5ff6'::uuid, 'Mateo Sánchez Mauro', 'Mateo Sánchez', 'Mauro'),
('d9e8eb20-619e-4121-9245-3bb36e8b7ae6'::uuid, 'Ramiro Iglesias Quintana', 'Ramiro Iglesias', 'Quintana'),
('f6e19b27-12f8-42e6-9d4d-a2ee9cc445ca'::uuid, 'Faustino Santarelli Castex', 'Faustino Santarelli', 'Castex'),
('c507c8a4-b3bd-4ac8-b143-ef3f21c86ed0'::uuid, 'Juan Cruz Corso', 'Juan Cruz', 'Corso'),
('a1fca0b6-af74-4511-a376-4ddadf31d1dd'::uuid, 'Ramiro Berardi Calvo', 'Ramiro Berardi', 'Calvo'),
('9f9d3d66-f507-4186-a20f-5bf2604586ab'::uuid, 'Diego Facundo Miño', 'Diego Facundo', 'Miño'),
('1fbe0634-734d-423f-9529-919a529cdaab'::uuid, 'Estefano David Aranda Caceres', 'Estefano David Aranda', 'Caceres'),
('e3fa39ab-d558-4a88-bfcb-fa09a1b9397c'::uuid, 'Facundo Paiva Kirichenko', 'Facundo Paiva', 'Kirichenko'),
('9b04f78e-ef7a-4758-934d-37161406688d'::uuid, 'Francisco Luis Bareiro Ochipinti', 'Francisco Luis Bareiro', 'Ochipinti'),
('4a937e10-ecdf-4dbc-b577-966402b6b568'::uuid, 'Joaquín Mussi Sbesa', 'Joaquín Mussi', 'Sbesa'),
('41b98856-66c8-4eed-9a16-ca62af5acb1d'::uuid, 'Luis Enrique Quinteros Caballero', 'Luis Enrique Quinteros', 'Caballero'),
('350f0f90-da1a-4f47-a880-40002413e3cf'::uuid, 'Marcello Giovanni Fretes Laterra', 'Marcello Giovanni Fretes', 'Laterra'),
('b44ecc53-835d-4a8e-adb2-5e67cb9646ca'::uuid, 'Yair Axel Nahuel Kacerosky', 'Yair Axel Nahuel', 'Kacerosky'),
('a5c1c05d-60e8-45c3-810f-16d965b35cf0'::uuid, 'Rafael Bareiro Ochipinti', 'Rafael Bareiro', 'Ochipinti'),
('adafdf53-769a-48dd-bd68-5e440e1904d9'::uuid, 'Rodolfo Alberto Rivadeneira', 'Rodolfo Alberto', 'Rivadeneira'),
('17788fff-7f05-4650-bd67-6fe0355f477f'::uuid, 'Thomás Santiago Guzmán', 'Thomás Santiago', 'Guzmán'),
('a24f0d21-a4f3-460d-85d6-d5c002fafec8'::uuid, 'Bautista Salinas Mealla', 'Bautista Salinas', 'Mealla'),
('f7fe55de-7142-4f01-8c8e-74f28a5343a7'::uuid, 'Benjamín Farías Cerioni', 'Benjamín Farías', 'Cerioni'),
('39ca2d48-70f3-4384-be25-8d321ab286a2'::uuid, 'Manuel Cuneo Camargo', 'Manuel Cuneo', 'Camargo'),
('425adbe0-ee4b-4765-99ac-df148519a29f'::uuid, 'Nicolás Agustin Cambiasso', 'Nicolás Agustin', 'Cambiasso'),
('dbfcfc9f-3ae1-4b1c-9ad8-668375fa2856'::uuid, 'Ramón Fernández Miranda', 'Ramón Fernández', 'Miranda'),
('90b78676-0839-49a3-a76a-0ded40fc1c23'::uuid, 'Simón José Pfister', 'Simón José', 'Pfister'),
('3dae09f4-734b-4ef7-8ee7-afda6941e5d4'::uuid, 'Nicolás Roger Farías', 'Nicolás Roger', 'Farías');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_z1_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_z1_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_z1_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_z1_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_z1_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_z1_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
  where (coalesce(t.attendance::text,'')||coalesce(t.players_snapshot::text,'')||coalesce(t.evaluation::text,'')) ~ rx.perdedoras;

-- reemplazo de ids embebidos (texto)
create or replace function pg_temp.swap(t text) returns text language plpgsql as $$
declare r record;
begin
  if t is null then return null; end if;
  for r in select loser, keep from fx loop
    if position(r.loser::text in t) > 0 then t := replace(t, r.loser::text, r.keep::text); end if;
  end loop;
  return t;
end $$;

update matches m set lineups = pg_temp.swap(lineups::text)::jsonb, events = pg_temp.swap(events::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_z1_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_z1_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_z1_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_z1_matches);
update match_events me set player_name = fn.full_name,
  details = case when me.details ? 'playerName' then me.details || jsonb_build_object('playerName', fn.full_name) else me.details end
  from fn where me.player_id = fn.keep;

-- roles y membresías
delete from club_person_roles r using fx
  where r.person_id = fx.loser and exists (select 1 from club_person_roles k where k.person_id = fx.keep
    and k.club_id = r.club_id and k.role = r.role and k.division_id is not distinct from r.division_id);
update club_person_roles r set person_id = fx.keep from fx where r.person_id = fx.loser;
update team_memberships t set person_id = fx.keep from fx where t.person_id = fx.loser;

update people p set full_name = fn.full_name, first_name = fn.first_name, last_name = fn.last_name from fn where p.id = fn.keep;
delete from people where id in (select loser from fx);

commit;
