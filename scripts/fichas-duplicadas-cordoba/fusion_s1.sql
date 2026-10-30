
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('0b0a588c-ddd4-428f-bf76-ded2360dc901'::uuid, 'b63b529d-f0ae-4cb8-8d89-9e0c91dd7eec'::uuid),
('9112b7e3-d25a-4876-92a4-38acbfe59c48'::uuid, '7c695e44-9a7d-416e-92b6-6a30184fb833'::uuid),
('2268045f-cfd6-4f0b-bc04-b641d2a3268b'::uuid, '1a13862f-65fb-4232-b23d-459638f4384d'::uuid),
('ed7cbdb7-0a78-4cba-9e56-2e4fcffbda07'::uuid, '1a13862f-65fb-4232-b23d-459638f4384d'::uuid),
('589ef281-924d-425b-b0a1-2da6a2a4ee75'::uuid, 'a7a350e8-64b8-4721-84b7-1edbd251a1bb'::uuid),
('86d7fcf7-a981-4650-ae92-73aa63c567b7'::uuid, 'd0b6e8d9-433e-4e91-80a4-c85b6ebaf88c'::uuid),
('e10f86fb-2d8e-4b05-89cf-a723d68c3693'::uuid, 'e5c16c51-bc08-4916-9f9e-cc9ec9560919'::uuid),
('0d0ce720-c840-4d1b-b6f6-e6e5e01ffa33'::uuid, '592c32a4-c681-4224-a819-d7c3dc36f72d'::uuid),
('74d2051a-d93b-4304-a256-8ecda1c69126'::uuid, '2fc9a159-c190-4bf4-ba5d-16db1b5198f9'::uuid),
('f4f3a709-82d1-477f-8938-e3c09c362472'::uuid, '9c67b534-5a81-4798-ba33-7caaa1494f13'::uuid),
('ae5fd595-5d85-4c02-ae30-33855067ac05'::uuid, '44c52781-eed7-4f3f-9615-bd0b359bdf70'::uuid),
('0cd006a4-44dd-40c8-ab0d-fa0bb9d1aaaa'::uuid, '510f542c-3350-4b54-92c2-1a7baa58edd3'::uuid),
('4a3f44d2-7724-497c-88a4-c812cfd86177'::uuid, '510f542c-3350-4b54-92c2-1a7baa58edd3'::uuid),
('323ff5f4-4aa4-48bf-b5ba-115ebbbcaa19'::uuid, '719865ab-d4d8-495f-a207-466796d6f7fb'::uuid),
('fa6397a9-583a-4bca-80b0-0aa422ad26eb'::uuid, '509e7579-595c-4795-b43d-e1636687bbe0'::uuid),
('e74d31e3-bc04-4110-8afb-be703f52f8c1'::uuid, 'e40868c3-1dca-4e57-870c-1106f9bc9ec7'::uuid),
('10918dbd-911e-4cae-9f54-2aa2d8ec407e'::uuid, '2929f2bb-0d4e-4cd7-a46b-7d7e00b4584a'::uuid),
('1d28754f-9135-4cbf-9148-d9d3835bf65a'::uuid, '29e882f0-30c1-477d-b3cb-ae6d45eaf088'::uuid),
('b87e5c22-9613-415e-b7de-5926055e4ca2'::uuid, '9b4ccfaa-e96b-4ddf-a82d-632f0c33c7ad'::uuid),
('b398bb46-9187-48a1-b5af-64c4bab55920'::uuid, '4a23712c-713a-483d-8d8a-38f69d4446da'::uuid),
('e429865c-d4ed-4165-9f82-af808cdda99a'::uuid, '4a23712c-713a-483d-8d8a-38f69d4446da'::uuid),
('b51f1aa0-9651-479f-a122-294191174c0a'::uuid, '6403e6e4-034b-4c41-a611-ffbcbf11f91a'::uuid),
('f1188551-7b6f-4b37-bdb4-cedd08f429f8'::uuid, '6403e6e4-034b-4c41-a611-ffbcbf11f91a'::uuid),
('8c40d8a3-4097-4b22-937f-ba0e827c9f64'::uuid, 'bfe53e7d-2d69-4fbe-b379-6983ad2296e5'::uuid),
('3f5b04cc-2a81-4815-aa11-4b4f259edfd7'::uuid, '9f2e4fb9-c70b-4f89-8dc2-de02300b54bf'::uuid),
('06ce9362-11bc-412f-ae1d-609d237d83b2'::uuid, '1eb9f5f5-10c6-4330-a8d9-7865ed1cec4f'::uuid),
('91635975-9a65-4a25-a025-1e67447f4042'::uuid, '2cf2f1a1-af0b-45ee-9f58-0b9c517f8286'::uuid),
('d5b0d5bf-49b1-498a-abb2-b81066ba83cf'::uuid, 'c88c3430-966a-4fae-af5d-c3cc48eb8c0b'::uuid),
('d8803a50-a3b3-4333-a83e-08cf091c3e11'::uuid, '3aec989d-510a-480b-9c79-b4604994139e'::uuid),
('09150e52-5fd7-49b0-a25f-a8c9757bed5f'::uuid, '896e0f92-7d89-4b4f-84ef-dde9d33d2ed2'::uuid),
('b648566a-1e97-4707-a43c-c9158ee210c7'::uuid, '496115df-5f5a-44f3-99b9-bdf739d7fa84'::uuid),
('958892f1-8177-4185-b716-ee3000ee5cda'::uuid, '5ddc458c-cc43-4fd7-9e15-380c27d249e5'::uuid),
('e1d33869-1fed-4abf-8197-00508b386c26'::uuid, '841ddc64-e365-49c0-8bf1-c55c09513ade'::uuid),
('3bd8a656-ac73-4eeb-a2a1-1cb12fbe8fdd'::uuid, '1920a929-49d2-4821-9a01-31131df67a7d'::uuid),
('a777e218-c873-4ee9-b952-c83208dbd266'::uuid, '6e4ea0fb-b514-4b71-90af-0b03abe578e2'::uuid),
('e5239580-8030-4952-b26c-7bc47464d342'::uuid, '0e0966a7-c4af-432b-a8f1-e01a57add268'::uuid),
('2d103611-1727-4cf6-8a51-6c8eb1703407'::uuid, '2363c000-6114-4eee-bb8e-d41169883369'::uuid),
('36a8e825-916c-43e8-9c22-c5542ed39287'::uuid, '9c364c05-4448-46c5-9ba9-c74da3798ad0'::uuid),
('97379e60-690f-41b4-a666-2f30aa0b2ca5'::uuid, '3ca604f1-3eb5-4798-a1d2-7c2129efc2d6'::uuid),
('4e5b66d2-7fa3-4d39-9a75-aef2822ee0b2'::uuid, '5ca5c8de-6727-49b4-a547-6c74a02c895a'::uuid),
('5b0d5002-5201-4d7b-9268-69a1c41b44ed'::uuid, 'fc9edcd6-4051-4143-a453-5aca3bf2be77'::uuid),
('ebb1fb77-f9de-4bfa-bbd0-f7adec31cca5'::uuid, '77f4106b-836e-4277-b7dd-b0fe069503ca'::uuid),
('dfc8b491-7410-4fb4-ab61-20f676536ba2'::uuid, 'bb421072-8087-4ecb-8ca0-888f87782367'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('b63b529d-f0ae-4cb8-8d89-9e0c91dd7eec'::uuid, 'Cleber Dias', 'Cleber', 'Dias'),
('7c695e44-9a7d-416e-92b6-6a30184fb833'::uuid, 'João Arraez', 'João', 'Arraez'),
('1a13862f-65fb-4232-b23d-459638f4384d'::uuid, 'Foster Douglas Dewitt', 'Foster Douglas', 'Dewitt'),
('a7a350e8-64b8-4721-84b7-1edbd251a1bb'::uuid, 'Reinaldo Piussi Mendoza', 'Reinaldo Piussi', 'Mendoza'),
('d0b6e8d9-433e-4e91-80a4-c85b6ebaf88c'::uuid, 'Mateo Perillo Albarracín', 'Mateo Perillo', 'Albarracín'),
('e5c16c51-bc08-4916-9f9e-cc9ec9560919'::uuid, 'Felipe Aliaga', 'Felipe', 'Aliaga'),
('592c32a4-c681-4224-a819-d7c3dc36f72d'::uuid, 'Reinaldo Piussi', 'Reinaldo', 'Piussi'),
('2fc9a159-c190-4bf4-ba5d-16db1b5198f9'::uuid, 'Justo Ferrario', 'Justo', 'Ferrario'),
('9c67b534-5a81-4798-ba33-7caaa1494f13'::uuid, 'Ignacio Péculo', 'Ignacio', 'Péculo'),
('44c52781-eed7-4f3f-9615-bd0b359bdf70'::uuid, 'Augusto Böhme', 'Augusto', 'Böhme'),
('510f542c-3350-4b54-92c2-1a7baa58edd3'::uuid, 'Tomás Vanni', 'Tomás', 'Vanni'),
('719865ab-d4d8-495f-a207-466796d6f7fb'::uuid, 'Tomás Elizalde', 'Tomás', 'Elizalde'),
('509e7579-595c-4795-b43d-e1636687bbe0'::uuid, 'Nicolás Macome', 'Nicolás', 'Macome'),
('e40868c3-1dca-4e57-870c-1106f9bc9ec7'::uuid, 'Juan Manuel Vivas', 'Juan Manuel', 'Vivas'),
('2929f2bb-0d4e-4cd7-a46b-7d7e00b4584a'::uuid, 'Bautista Salinas Mealla', 'Bautista Salinas', 'Mealla'),
('29e882f0-30c1-477d-b3cb-ae6d45eaf088'::uuid, 'Benjamín Farías Cerioni', 'Benjamín Farías', 'Cerioni'),
('9b4ccfaa-e96b-4ddf-a82d-632f0c33c7ad'::uuid, 'Federico Narváez', 'Federico', 'Narváez'),
('4a23712c-713a-483d-8d8a-38f69d4446da'::uuid, 'Artum López', 'Artum', 'López'),
('6403e6e4-034b-4c41-a611-ffbcbf11f91a'::uuid, 'Juan González', 'Juan', 'González'),
('bfe53e7d-2d69-4fbe-b379-6983ad2296e5'::uuid, 'Joaquín Lamas', 'Joaquín', 'Lamas'),
('9f2e4fb9-c70b-4f89-8dc2-de02300b54bf'::uuid, 'Tomás Salas', 'Tomás', 'Salas'),
('1eb9f5f5-10c6-4330-a8d9-7865ed1cec4f'::uuid, 'José Tomás Bonilla', 'José Tomás', 'Bonilla'),
('2cf2f1a1-af0b-45ee-9f58-0b9c517f8286'::uuid, 'Cristóbal Escobar', 'Cristóbal', 'Escobar'),
('c88c3430-966a-4fae-af5d-c3cc48eb8c0b'::uuid, 'Nicolás Weitzel', 'Nicolás', 'Weitzel'),
('3aec989d-510a-480b-9c79-b4604994139e'::uuid, 'Joaquín Mussi', 'Joaquín', 'Mussi'),
('896e0f92-7d89-4b4f-84ef-dde9d33d2ed2'::uuid, 'Juan Corso', 'Juan', 'Corso'),
('496115df-5f5a-44f3-99b9-bdf739d7fa84'::uuid, 'Alejo Lavayén', 'Alejo', 'Lavayén'),
('5ddc458c-cc43-4fd7-9e15-380c27d249e5'::uuid, 'Tobías Wade', 'Tobías', 'Wade'),
('841ddc64-e365-49c0-8bf1-c55c09513ade'::uuid, 'Ignacio Bottazzini', 'Ignacio', 'Bottazzini'),
('1920a929-49d2-4821-9a01-31131df67a7d'::uuid, 'Martín Vaca', 'Martín', 'Vaca'),
('6e4ea0fb-b514-4b71-90af-0b03abe578e2'::uuid, 'Ignacio Dogliani', 'Ignacio', 'Dogliani'),
('0e0966a7-c4af-432b-a8f1-e01a57add268'::uuid, 'Ignacio Orsetti', 'Ignacio', 'Orsetti'),
('2363c000-6114-4eee-bb8e-d41169883369'::uuid, 'Rodrigo Fernández Criado', 'Rodrigo Fernández', 'Criado'),
('9c364c05-4448-46c5-9ba9-c74da3798ad0'::uuid, 'Bautista Estellés', 'Bautista', 'Estellés'),
('3ca604f1-3eb5-4798-a1d2-7c2129efc2d6'::uuid, 'Nicolás Viola', 'Nicolás', 'Viola'),
('5ca5c8de-6727-49b4-a547-6c74a02c895a'::uuid, 'Juan Ignacio Greising Revol', 'Juan Ignacio Greising', 'Revol'),
('fc9edcd6-4051-4143-a453-5aca3bf2be77'::uuid, 'Enzo Avaca', 'Enzo', 'Avaca'),
('77f4106b-836e-4277-b7dd-b0fe069503ca'::uuid, 'Ignacio Gandini', 'Ignacio', 'Gandini'),
('bb421072-8087-4ecb-8ca0-888f87782367'::uuid, 'Luciano Avaca', 'Luciano', 'Avaca');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_s1_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_s1_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_s1_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_s1_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_s1_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_s1_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_s1_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_s1_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_s1_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_s1_matches);
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
