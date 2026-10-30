
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('a90418c3-3300-45bb-8540-f26abd9726cf'::uuid, '510d1e03-0302-4ec4-b169-594c37fadee9'::uuid),
('d5543d01-19ed-4a1c-b0cd-6a02171ccd20'::uuid, '7ed01b4d-1f8c-4d61-ac4a-89ff02872b09'::uuid),
('322e44b2-1645-44d0-906c-36a557ec18fc'::uuid, '23e83564-a20f-473a-bc41-b9df07351dce'::uuid),
('7324cd71-be83-4ff5-8dcb-6200f921a687'::uuid, '68253302-d6bb-46d1-9299-d5f3b63b517b'::uuid),
('9b7d28c0-2961-4e54-9236-8d206de632d8'::uuid, '8acc0e57-b53c-4608-a83a-25c13147ad9f'::uuid),
('d8a42a9b-f3fd-4d13-a52f-23b422661e98'::uuid, '8acc0e57-b53c-4608-a83a-25c13147ad9f'::uuid),
('00d4c623-71c9-40c9-bf5a-cacc76530eed'::uuid, 'fe906443-05e8-4fde-a3c8-7dbcdae3ed5a'::uuid),
('6affab1c-e12a-42c6-bf22-ca9a9d353372'::uuid, 'fe906443-05e8-4fde-a3c8-7dbcdae3ed5a'::uuid),
('0f370aa3-2431-488e-87b1-34276f973f01'::uuid, 'fa9afcf0-1320-4270-b85a-cb30bd42cdc3'::uuid),
('4782d9c8-2776-4979-ba63-50a355b72333'::uuid, 'fa9afcf0-1320-4270-b85a-cb30bd42cdc3'::uuid),
('478e1dcc-a74f-4518-bb01-6ced531fa7f2'::uuid, 'fa9afcf0-1320-4270-b85a-cb30bd42cdc3'::uuid),
('cdbd1aee-b772-41f9-9e9c-4064f9b56a82'::uuid, '720ad760-04bf-49d6-a1b7-6b48730d4706'::uuid),
('219ec21f-c5ac-44ab-96d9-a61b289f282b'::uuid, 'd69f2a74-7fb2-4cc0-9936-53276ce02d44'::uuid),
('04936524-be41-4952-a0d4-92efb5d65a7a'::uuid, 'ec13e71c-ac1b-49be-99cd-fe2d7b69b72c'::uuid),
('519f5b8d-b806-4ba1-b7ae-4636b5db707c'::uuid, '1c2ded20-6ce6-4693-866a-19c6bae478f7'::uuid),
('b6c59f50-b22c-4ae4-8148-1b89320e4a93'::uuid, '4cc451ea-b1c0-4550-aed9-1222027df123'::uuid),
('55855105-09d1-44c1-b539-6ad6239a7a50'::uuid, '64ed7db3-c00f-4642-80a1-6caca6eb3b58'::uuid),
('88864ea6-ea83-46ee-b335-bead083863a7'::uuid, '64ed7db3-c00f-4642-80a1-6caca6eb3b58'::uuid),
('db4a73dd-d7c6-42ae-9d85-410636b3b0b6'::uuid, '64ed7db3-c00f-4642-80a1-6caca6eb3b58'::uuid),
('01b86abb-983a-4fa1-b72d-6d54efd669a3'::uuid, 'fee7bd31-1744-4020-9859-5646367c640a'::uuid),
('345e57e9-361f-4975-8dfc-1f382a955bac'::uuid, '144f43c9-3577-4114-bffb-72634329e501'::uuid),
('4a3ff3d9-785b-4a5d-95b0-1e1f79de62c8'::uuid, 'b3649f38-1328-410c-8bb9-76c24767b19c'::uuid),
('02337318-e274-4a33-a081-087b85027617'::uuid, '587637a1-b62a-4062-b739-f1940cdd2eef'::uuid),
('c7d7bf75-ffde-41ea-8e91-433cf0315761'::uuid, '5bdb40a5-2633-47b1-bae8-aabf87f59fe8'::uuid),
('6a6cdcde-08ee-41ec-854c-6bb7da139037'::uuid, 'fe2c3537-e76a-4248-a090-284fd316b7be'::uuid),
('8e3af110-37a4-45a1-b9f9-e7792ff889ea'::uuid, '99499907-04a0-46f4-9612-140c98428a02'::uuid),
('c8aef0db-bb08-420c-a87d-75b757f1b444'::uuid, 'c7a8a203-c67f-4e4e-a811-64c6d5a38ab9'::uuid),
('07f1244e-9421-46b6-853d-534f8a480d6a'::uuid, 'f67771cb-f710-4cff-b0f6-8c1007ecef68'::uuid),
('3946addf-03ef-45a3-8e74-e2c72c69fbac'::uuid, 'da4e4ec9-7445-4dc8-9b1d-c042771a1985'::uuid),
('217da56a-7fb9-420b-b278-3f27571ca917'::uuid, 'e33d7902-98a9-4df2-843e-9d8e8c5fe554'::uuid),
('a03f11cf-1126-4e8c-bd16-c3d6780259d0'::uuid, '7792cb9f-ea26-42e0-b00c-830c36bb18f8'::uuid),
('18adfafb-dccb-420f-94d2-9952ef37d515'::uuid, 'e1fe71d7-0330-4d1d-b9fc-93bcc9b36522'::uuid),
('e8f4884b-0bdf-4af9-a583-74158b3373f8'::uuid, '4e16a8f9-3c2f-43f2-9a3a-a68db2d5cc4f'::uuid),
('7f25a4e2-9610-4aec-a51c-ff306e3d672d'::uuid, '81d8e20b-511d-4f6a-8af0-86b02a0961ae'::uuid),
('d1ec8c3c-34ff-470e-bf36-832330e0e4b2'::uuid, 'c9a24765-74b6-47f5-8342-bc3df62a1daa'::uuid),
('f20dc34d-6f77-4851-82d8-bafa0080bcc1'::uuid, '2c957eb6-0750-44d1-9619-092194f9fba5'::uuid),
('bbad932c-4af5-49ab-ac7b-381a1a618971'::uuid, '7431be91-9b05-4d37-bb44-cf5af6bed6cc'::uuid),
('0ead70ef-55ef-4e70-a490-2c766288a2f9'::uuid, '49d51c3c-e99f-4ee4-983b-b12aa7f13f6e'::uuid),
('58ea1f7c-6dc8-4181-bfb7-260b3a7c167a'::uuid, '31c1d222-7f91-4168-9abc-fa9de5a5d1eb'::uuid),
('38cc677d-5182-4d4f-ba9b-d3057e829c82'::uuid, 'ee2a830f-7a93-424c-930f-4f1106cf183e'::uuid),
('9aeedf29-47aa-4cf0-8115-e7aeb3f46d58'::uuid, '3f884ddd-9a5e-4f3a-88a0-0bdea5fc986f'::uuid),
('da69b6fb-4622-4e21-8ec9-0871cb7e13d7'::uuid, '4fea119b-cafa-4490-8461-7e63cea8e077'::uuid),
('708257c8-eb81-4991-b7b8-2336f48c70e3'::uuid, '63b7a628-4fa5-4a73-b946-dee8a8b2cfcf'::uuid),
('92f59741-ac7e-463d-a807-f45b2657636d'::uuid, '96e4b177-ece9-49e0-a7d2-15b02fb39857'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('510d1e03-0302-4ec4-b169-594c37fadee9'::uuid, 'Lautaro Facundo Fanlo', 'Lautaro Facundo', 'Fanlo'),
('7ed01b4d-1f8c-4d61-ac4a-89ff02872b09'::uuid, 'Robson “Varejão” Morais', 'Robson “Varejão”', 'Morais'),
('23e83564-a20f-473a-bc41-b9df07351dce'::uuid, 'Noah Riley Flesch', 'Noah Riley', 'Flesch'),
('68253302-d6bb-46d1-9299-d5f3b63b517b'::uuid, 'Alfonso Perillo Albarracín', 'Alfonso Perillo', 'Albarracín'),
('8acc0e57-b53c-4608-a83a-25c13147ad9f'::uuid, 'James Enfys Thiel', 'James Enfys', 'Thiel'),
('fe906443-05e8-4fde-a3c8-7dbcdae3ed5a'::uuid, 'Ignacio Álvarez Akiki', 'Ignacio Álvarez', 'Akiki'),
('fa9afcf0-1320-4270-b85a-cb30bd42cdc3'::uuid, 'Germán Kiegel', 'Germán', 'Kiegel'),
('720ad760-04bf-49d6-a1b7-6b48730d4706'::uuid, 'Santiago Álvarez', 'Santiago', 'Álvarez'),
('d69f2a74-7fb2-4cc0-9936-53276ce02d44'::uuid, 'Cristóbal Game', 'Cristóbal', 'Game'),
('ec13e71c-ac1b-49be-99cd-fe2d7b69b72c'::uuid, 'Matías Sauze', 'Matías', 'Sauze'),
('1c2ded20-6ce6-4693-866a-19c6bae478f7'::uuid, 'Matías Orlando', 'Matías', 'Orlando'),
('4cc451ea-b1c0-4550-aed9-1222027df123'::uuid, 'Joaquín Aguilar', 'Joaquín', 'Aguilar'),
('64ed7db3-c00f-4642-80a1-6caca6eb3b58'::uuid, 'Agustín Sarelli', 'Agustín', 'Sarelli'),
('fee7bd31-1744-4020-9859-5646367c640a'::uuid, 'Germán Tello Fredes', 'Germán Tello', 'Fredes'),
('144f43c9-3577-4114-bffb-72634329e501'::uuid, 'Ramón Fernández', 'Ramón', 'Fernández'),
('b3649f38-1328-410c-8bb9-76c24767b19c'::uuid, 'Pedro Coll (vc)', 'Pedro Coll', '(vc)'),
('587637a1-b62a-4062-b739-f1940cdd2eef'::uuid, 'Joaquín Domínguez', 'Joaquín', 'Domínguez'),
('5bdb40a5-2633-47b1-bae8-aabf87f59fe8'::uuid, 'Valentino Quattrocchi', 'Valentino', 'Quattrocchi'),
('fe2c3537-e76a-4248-a090-284fd316b7be'::uuid, 'Nicolás Toth', 'Nicolás', 'Toth'),
('99499907-04a0-46f4-9612-140c98428a02'::uuid, 'Ariel Núñez', 'Ariel', 'Núñez'),
('c7a8a203-c67f-4e4e-a811-64c6d5a38ab9'::uuid, 'Matías Garafulic', 'Matías', 'Garafulic'),
('f67771cb-f710-4cff-b0f6-8c1007ecef68'::uuid, 'Tomás Queirolo', 'Tomás', 'Queirolo'),
('da4e4ec9-7445-4dc8-9b1d-c042771a1985'::uuid, 'Tomás Baguley', 'Tomás', 'Baguley'),
('e33d7902-98a9-4df2-843e-9d8e8c5fe554'::uuid, 'Jordi Chávez', 'Jordi', 'Chávez'),
('7792cb9f-ea26-42e0-b00c-830c36bb18f8'::uuid, 'Thomás Guzmán', 'Thomás', 'Guzmán'),
('e1fe71d7-0330-4d1d-b9fc-93bcc9b36522'::uuid, 'Francisco Lusarretá', 'Francisco', 'Lusarretá'),
('4e16a8f9-3c2f-43f2-9a3a-a68db2d5cc4f'::uuid, 'Agustín Fraga', 'Agustín', 'Fraga'),
('81d8e20b-511d-4f6a-8af0-86b02a0961ae'::uuid, 'Faustino Santarelli Castex', 'Faustino Santarelli', 'Castex'),
('c9a24765-74b6-47f5-8342-bc3df62a1daa'::uuid, 'Rodrigo Fernández Criado', 'Rodrigo Fernández', 'Criado'),
('2c957eb6-0750-44d1-9619-092194f9fba5'::uuid, 'Juan Ignacio Rodríguez', 'Juan Ignacio', 'Rodríguez'),
('7431be91-9b05-4d37-bb44-cf5af6bed6cc'::uuid, 'Bautista Estellés', 'Bautista', 'Estellés'),
('49d51c3c-e99f-4ee4-983b-b12aa7f13f6e'::uuid, 'Franco Rossetto', 'Franco', 'Rossetto'),
('31c1d222-7f91-4168-9abc-fa9de5a5d1eb'::uuid, 'Federico Serpa', 'Federico', 'Serpa'),
('ee2a830f-7a93-424c-930f-4f1106cf183e'::uuid, 'Bautista Lescano', 'Bautista', 'Lescano'),
('3f884ddd-9a5e-4f3a-88a0-0bdea5fc986f'::uuid, 'Alejo Sugasti', 'Alejo', 'Sugasti'),
('4fea119b-cafa-4490-8461-7e63cea8e077'::uuid, 'Mateo Pasquini', 'Mateo', 'Pasquini'),
('63b7a628-4fa5-4a73-b946-dee8a8b2cfcf'::uuid, 'Nicolás Revol Pitt', 'Nicolás Revol', 'Pitt'),
('96e4b177-ece9-49e0-a7d2-15b02fb39857'::uuid, 'Diego Correa', 'Diego', 'Correa');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_s2_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_s2_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_s2_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_s2_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_s2_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_s2_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_s2_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_s2_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_s2_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_s2_matches);
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
