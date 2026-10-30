
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('de46ebbc-a0fe-4f3c-b40b-1d5cc24e4c06'::uuid, '6776a6b1-dba5-4dd1-a45f-f9c61667e111'::uuid),
('3dc1db98-118f-4c6c-8a5d-dc99a0efbb11'::uuid, '0571d506-6f41-44c5-9eb4-4b013d11f21c'::uuid),
('583c8bb6-d22f-4ebd-b24f-a47cdc45d1f0'::uuid, '74fc45d4-57a9-4f9b-8be6-fd6322f0ff98'::uuid),
('6c8d070d-8602-4d21-9097-3d586c4cca2b'::uuid, '87c06198-b0a4-4df1-af1b-674a4b0587f7'::uuid),
('ef456a37-167e-44e9-a189-496b5ad3eef6'::uuid, 'a44e32d2-f103-4a74-96e5-226db879e28f'::uuid),
('031e4700-2554-4a23-a44a-d080bb646f2e'::uuid, '38565530-d5c2-4c07-83c7-b430ee42e9d9'::uuid),
('1c053f79-a037-4b93-b0f4-4265352eca3b'::uuid, '76cf27ec-064e-4b07-80aa-1ddca7061d83'::uuid),
('7de2eb91-92c3-4376-9d11-c21fb87b584a'::uuid, '8805af02-56c9-4c85-ad4b-7f691a49f858'::uuid),
('27bda129-6cd6-4d07-a417-c2f80b9f7754'::uuid, 'ebbf8edd-dc04-44b1-8ce5-4981ba19745e'::uuid),
('601e3d0f-48e3-41c6-a53e-c98ba75ac312'::uuid, 'ebbf8edd-dc04-44b1-8ce5-4981ba19745e'::uuid),
('91f5f58f-1818-455a-95ab-377bdbbf9cc4'::uuid, '0b15e191-f7c6-4606-9174-94db4b4a1414'::uuid),
('223c53ed-4daa-40ef-beff-f510299d3370'::uuid, 'e32fb975-0fba-46ff-9ba2-6bc5f54c9874'::uuid),
('4dbde4cd-d617-4355-bcaf-aacd81e60565'::uuid, '8e819bd0-fadd-497b-bc1e-068d99766596'::uuid),
('fca2e157-4cf7-4829-b0d5-c14d07635072'::uuid, '9152c046-664b-4880-803b-c247c320b848'::uuid),
('0c4b7e99-0f37-4946-bb08-54a4fb85255a'::uuid, 'cb6a281c-b7bd-44f3-8a47-a82929fe1d95'::uuid),
('3005cd84-dd6f-4efe-ac21-2239bf2effd7'::uuid, '1ce2f2e8-960c-4f2a-b155-e7d5d4b06ba2'::uuid),
('67717559-0ec3-4992-99ec-a614027b54d9'::uuid, 'e910642b-4ec6-4617-b866-b3eec8161cd0'::uuid),
('11f1dc6f-3af5-4709-8ab1-009c091bb3cc'::uuid, '11c152d9-512b-402d-bd69-045c26edb87a'::uuid),
('6e962153-3ed6-484c-88d4-fd31b7417ae6'::uuid, '5c4abe7b-8545-4c89-8b8d-5dc877153728'::uuid),
('7eccdfd9-da71-4b81-92af-93ea0f7da093'::uuid, 'a4867b1d-5ad7-48b5-8b54-85ea81d4e031'::uuid),
('c31b9668-9068-4746-80d3-5dd0bcf7b633'::uuid, 'c59be8e1-4bc0-4df8-9f51-b550916245f9'::uuid),
('db6672fc-88ff-45f2-aa8d-100d1198663e'::uuid, '04f71628-0280-4f9d-9df0-4978b4219894'::uuid),
('25f6dc6d-f44a-4736-820a-6019d04f2f69'::uuid, '768cf41b-6bd4-4ae4-9f4f-489976cbf2e8'::uuid),
('7651845e-94bc-4cdc-bfaf-3122f4f7f600'::uuid, '8754b037-f70e-4eac-b93b-d3c0cbd8c490'::uuid),
('d0c836f6-52b2-4028-a8fe-93f2bf5e1e56'::uuid, '22ddab18-c6af-416e-a2ec-da56cc02f6f0'::uuid),
('f6789a1b-fb11-4b15-b88c-f33190ed676b'::uuid, '8d4a8b00-8f65-4d5b-97a3-705b58e154dd'::uuid),
('4161fbc7-3f3d-4f5d-b6da-06a90f2e4a6e'::uuid, '65d95365-24ba-434e-b4cd-6e4dabea2e92'::uuid),
('70283c80-729a-4728-9580-5a0cda4da8aa'::uuid, '65d95365-24ba-434e-b4cd-6e4dabea2e92'::uuid),
('68bc3083-ddb4-458d-b901-e0d6828f6c7e'::uuid, '56250f03-9eb0-43d1-9fbe-5ac87d49aef2'::uuid),
('81b74650-cfb2-4858-88b9-f7be1b2ad3b1'::uuid, '9efde9f9-7da2-4b99-bc0d-bfb22e615c89'::uuid),
('38e2656f-520e-45b0-ac25-8770b31809d4'::uuid, '0c6a2b65-d2d6-404e-8e13-3d158487ecc9'::uuid),
('f48e35c6-c2cd-433e-8387-4871a01b2917'::uuid, '36cd7988-937a-487c-9ef0-cd60e7a884a5'::uuid),
('a033276c-04cc-490e-a87a-820753ac045b'::uuid, '0c93cc8b-bf3d-4716-a73d-b461caa433af'::uuid),
('a4d11fe1-138d-453d-8311-b1d7f74d0fc0'::uuid, '12397f23-bd76-4eba-a813-eea13ed14bc6'::uuid),
('34492a21-1844-4f81-9089-9d0a669dfee1'::uuid, 'd94b62a3-0261-4f3c-9d06-adf27b48de5c'::uuid),
('3ada665b-296d-4090-981e-f0e8c5b0c791'::uuid, '6f42d582-4aba-42f5-aff3-ffc67327c0d3'::uuid),
('4bb550f8-b9c6-4685-987a-ac21c9addb81'::uuid, '4bfb5525-b156-4a4a-9bc6-aad0cd06879b'::uuid),
('5d38ba36-594c-4416-aee6-431596c5103a'::uuid, '506ec158-f29a-495c-a4aa-fb85d9f7ea3f'::uuid),
('6b8219ed-df12-4dc0-8e9e-8ac9e9ab7fef'::uuid, 'a5fdd09c-28b4-48e5-9465-dbe57aea70b7'::uuid),
('b0eab788-d7a2-43a5-b247-51889f1535b5'::uuid, 'cccdcc88-42ee-4acf-9f32-ccdac796823e'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('6776a6b1-dba5-4dd1-a45f-f9c61667e111'::uuid, 'Hélder “Big Mike” Lúcio', 'Hélder “Big Mike”', 'Lúcio'),
('0571d506-6f41-44c5-9eb4-4b013d11f21c'::uuid, 'Mateo Sanguinetti Young', 'Mateo Sanguinetti', 'Young'),
('74fc45d4-57a9-4f9b-8be6-fd6322f0ff98'::uuid, 'José Ignacio Rodríguez Balbi', 'José Ignacio Rodríguez', 'Balbi'),
('87c06198-b0a4-4df1-af1b-674a4b0587f7'::uuid, 'Nicolás Pittaluga', 'Nicolás', 'Pittaluga'),
('a44e32d2-f103-4a74-96e5-226db879e28f'::uuid, 'Ícaro Amarillo', 'Ícaro', 'Amarillo'),
('38565530-d5c2-4c07-83c7-b430ee42e9d9'::uuid, 'Manuel Diana', 'Manuel', 'Diana'),
('76cf27ec-064e-4b07-80aa-1ddca7061d83'::uuid, 'Pedro Márisco', 'Pedro', 'Márisco'),
('8805af02-56c9-4c85-ad4b-7f691a49f858'::uuid, 'Juan Manuel Alonso', 'Juan Manuel', 'Alonso'),
('ebbf8edd-dc04-44b1-8ce5-4981ba19745e'::uuid, 'Juan Sebastián Bianchi', 'Juan Sebastián', 'Bianchi'),
('0b15e191-f7c6-4606-9174-94db4b4a1414'::uuid, 'Raúl Guraib', 'Raúl', 'Guraib'),
('e32fb975-0fba-46ff-9ba2-6bc5f54c9874'::uuid, 'Ignacio Cerrutti', 'Ignacio', 'Cerrutti'),
('8e819bd0-fadd-497b-bc1e-068d99766596'::uuid, 'José Calderoni', 'José', 'Calderoni'),
('9152c046-664b-4880-803b-c247c320b848'::uuid, 'Máximo Ledesma', 'Máximo', 'Ledesma'),
('cb6a281c-b7bd-44f3-8a47-a82929fe1d95'::uuid, 'Manuel Giannantonio', 'Manuel', 'Giannantonio'),
('1ce2f2e8-960c-4f2a-b155-e7d5d4b06ba2'::uuid, 'Nicolás Cambiasso', 'Nicolás', 'Cambiasso'),
('e910642b-4ec6-4617-b866-b3eec8161cd0'::uuid, 'Manuel Cuneo Camargo', 'Manuel Cuneo', 'Camargo'),
('11c152d9-512b-402d-bd69-045c26edb87a'::uuid, 'Mateo Gasparotti', 'Mateo', 'Gasparotti'),
('5c4abe7b-8545-4c89-8b8d-5dc877153728'::uuid, 'Agustín Benítez', 'Agustín', 'Benítez'),
('a4867b1d-5ad7-48b5-8b54-85ea81d4e031'::uuid, 'Francisco Calello', 'Francisco', 'Calello'),
('c59be8e1-4bc0-4df8-9f51-b550916245f9'::uuid, 'Joaquín Mussi', 'Joaquín', 'Mussi'),
('04f71628-0280-4f9d-9df0-4978b4219894'::uuid, 'Cristóbal Barrera', 'Cristóbal', 'Barrera'),
('768cf41b-6bd4-4ae4-9f4f-489976cbf2e8'::uuid, 'Lukas Vega', 'Lukas', 'Vega'),
('8754b037-f70e-4eac-b93b-d3c0cbd8c490'::uuid, 'Cristóbal Soto', 'Cristóbal', 'Soto'),
('22ddab18-c6af-416e-a2ec-da56cc02f6f0'::uuid, 'Thiago Fernández Bedoya', 'Thiago Fernández', 'Bedoya'),
('8d4a8b00-8f65-4d5b-97a3-705b58e154dd'::uuid, 'Emanuel Cáceres', 'Emanuel', 'Cáceres'),
('65d95365-24ba-434e-b4cd-6e4dabea2e92'::uuid, 'Bautista Farisé', 'Bautista', 'Farisé'),
('56250f03-9eb0-43d1-9fbe-5ac87d49aef2'::uuid, 'Ignacio Díaz', 'Ignacio', 'Díaz'),
('9efde9f9-7da2-4b99-bc0d-bfb22e615c89'::uuid, 'Valentín Vicente Vidal', 'Valentín Vicente', 'Vidal'),
('0c6a2b65-d2d6-404e-8e13-3d158487ecc9'::uuid, 'Felipe Villagrán', 'Felipe', 'Villagrán'),
('36cd7988-937a-487c-9ef0-cd60e7a884a5'::uuid, 'Franco Benítez', 'Franco', 'Benítez'),
('0c93cc8b-bf3d-4716-a73d-b461caa433af'::uuid, 'Pedro Coll', 'Pedro', 'Coll'),
('12397f23-bd76-4eba-a813-eea13ed14bc6'::uuid, 'Joaquín Pascual Viale', 'Joaquín Pascual', 'Viale'),
('d94b62a3-0261-4f3c-9d06-adf27b48de5c'::uuid, 'Martín Vaca', 'Martín', 'Vaca'),
('6f42d582-4aba-42f5-aff3-ffc67327c0d3'::uuid, 'Francisco Sluga', 'Francisco', 'Sluga'),
('4bfb5525-b156-4a4a-9bc6-aad0cd06879b'::uuid, 'Tomás Dande', 'Tomás', 'Dande'),
('506ec158-f29a-495c-a4aa-fb85d9f7ea3f'::uuid, 'Ignacio Dogliani', 'Ignacio', 'Dogliani'),
('a5fdd09c-28b4-48e5-9465-dbe57aea70b7'::uuid, 'Juan Pedro Bernasconi', 'Juan Pedro', 'Bernasconi'),
('cccdcc88-42ee-4acf-9f32-ccdac796823e'::uuid, 'Joaquín Domínguez', 'Joaquín', 'Domínguez');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_s3_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_s3_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_s3_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_s3_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_s3_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_s3_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_s3_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_s3_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_s3_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_s3_matches);
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
