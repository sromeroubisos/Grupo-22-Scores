
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('00c70c56-dfbe-4303-9b7b-3fd8a2b3dbb3'::uuid, '49418d47-82c6-471f-9eb2-bb5ea0bd8544'::uuid),
('01a702e3-ac19-4bc0-a407-f94cd57bb625'::uuid, '05dc6c8c-b31f-4b64-a76c-b5ba4eaf9597'::uuid),
('4757e1d6-4b9f-42be-a800-49171a8a6d5a'::uuid, '065dad66-81bd-41f5-810c-5e474f23074b'::uuid),
('6f42d582-4aba-42f5-aff3-ffc67327c0d3'::uuid, '065dad66-81bd-41f5-810c-5e474f23074b'::uuid),
('8e5130ca-d47c-4bd0-a467-57a67f2b8adc'::uuid, '0c93cc8b-bf3d-4716-a73d-b461caa433af'::uuid),
('b3649f38-1328-410c-8bb9-76c24767b19c'::uuid, '0c93cc8b-bf3d-4716-a73d-b461caa433af'::uuid),
('811d9237-292b-4963-8ee4-6c22ae09f63a'::uuid, '12397f23-bd76-4eba-a813-eea13ed14bc6'::uuid),
('65e770e5-e6d3-45d1-82e8-c4b0d72a4043'::uuid, '12397f23-bd76-4eba-a813-eea13ed14bc6'::uuid),
('5fa5e415-beee-4c7f-9634-8ac456af5219'::uuid, '16678fb8-afc9-41d4-86e4-3264d6b53444'::uuid),
('18b7d7ad-a53d-46e1-a7e5-1ceb53ac9947'::uuid, '71e24d03-08e4-499b-b420-34d32dc17801'::uuid),
('807a8a34-1080-45f7-b8dc-59091016b306'::uuid, '1b8982b2-ae8a-4411-aa5a-4b7bf8cea3bb'::uuid),
('22175d65-9876-4997-ba85-04e22a51014c'::uuid, 'da4e4ec9-7445-4dc8-9b1d-c042771a1985'::uuid),
('65d95365-24ba-434e-b4cd-6e4dabea2e92'::uuid, '25b64fd6-2e29-4297-aba4-a0b4545ebc7f'::uuid),
('2a38139c-7d9b-46d8-bf10-039b7efb6af1'::uuid, '9240c615-c186-4110-9d5a-b0963d1a08f8'::uuid),
('fb23ef88-41a7-4296-9a25-f9e1ccbc8a90'::uuid, 'e6075639-63e3-4ff0-8ac5-396340b5253d'::uuid),
('2f5e879d-fa60-4f63-bcb1-822fc4260276'::uuid, 'e6075639-63e3-4ff0-8ac5-396340b5253d'::uuid),
('4bfb5525-b156-4a4a-9bc6-aad0cd06879b'::uuid, 'e6075639-63e3-4ff0-8ac5-396340b5253d'::uuid),
('32b7784b-edae-4f12-88d3-6057d94214b6'::uuid, 'a0d2398b-6030-4139-bd74-8f92b0fcc748'::uuid),
('fc9edcd6-4051-4143-a453-5aca3bf2be77'::uuid, 'a0d2398b-6030-4139-bd74-8f92b0fcc748'::uuid),
('36aa6fde-14e3-4e81-9ffb-2f088848f73f'::uuid, 'f029b349-f90f-4ec3-8835-57e31979a78b'::uuid),
('694e20c4-2331-451a-8e66-4ae21c806817'::uuid, 'e258ec33-18c3-4374-9987-25c40bfc4d2b'::uuid),
('38e5ea46-7706-45a5-8a66-7ecd7c593af9'::uuid, 'e258ec33-18c3-4374-9987-25c40bfc4d2b'::uuid),
('c59be8e1-4bc0-4df8-9f51-b550916245f9'::uuid, '3aec989d-510a-480b-9c79-b4604994139e'::uuid),
('691c2034-a4a7-41a7-ab89-4605e6bdbb89'::uuid, '6a3a7a2c-d647-4cc6-8f60-cc1b11642736'::uuid),
('3cfacfb0-80f8-4d77-a596-f022c8f1fb62'::uuid, '6a3a7a2c-d647-4cc6-8f60-cc1b11642736'::uuid),
('e40868c3-1dca-4e57-870c-1106f9bc9ec7'::uuid, '43146d6b-2662-436f-a335-5010e58c89c3'::uuid),
('510f542c-3350-4b54-92c2-1a7baa58edd3'::uuid, '477bfdf0-fced-4434-a20e-6536e545ea8d'::uuid),
('4c55b150-df39-4836-883b-689f98bae4a6'::uuid, 'fad9f9f6-3517-4785-9e47-63559ba8efb7'::uuid),
('c16450ea-19d4-4990-92bb-c01f34b680c3'::uuid, 'cd7150fa-b35c-448b-92f7-07919d8f8300'::uuid),
('4fea119b-cafa-4490-8461-7e63cea8e077'::uuid, 'cd7150fa-b35c-448b-92f7-07919d8f8300'::uuid),
('52fca35e-0162-445f-b417-29d1faa43f0a'::uuid, '8131190b-ae0e-4d95-81ef-4fb3ef9cf9a3'::uuid),
('5b29993d-5ece-4150-8b1b-1dabbd7d4ff2'::uuid, '6d938699-e675-4532-8bf9-e747ec1afce7'::uuid),
('7431be91-9b05-4d37-bb44-cf5af6bed6cc'::uuid, '6d938699-e675-4532-8bf9-e747ec1afce7'::uuid),
('9c364c05-4448-46c5-9ba9-c74da3798ad0'::uuid, '6d938699-e675-4532-8bf9-e747ec1afce7'::uuid),
('e57f9c54-d4f8-48fa-927f-e51a986e57a3'::uuid, '5e6e2ff5-db1f-4934-bf92-1477be89f25a'::uuid),
('63af6bbd-ecb1-4d73-8df6-bcae5a83cb4d'::uuid, '76b306ae-589d-4879-a695-f3aed57c478a'::uuid),
('de6c3c46-25cd-4c9c-a1db-d26742f920d2'::uuid, '678d745d-4d0a-413f-b116-3ddd237a98be'::uuid),
('b04e372b-7b0e-492c-889c-6b357a8b4fc2'::uuid, '6ce46fbe-b705-4a06-8fee-b7e928580315'::uuid),
('a5ddae1b-7e3b-4239-b585-c79e310d609f'::uuid, '7254de14-14b7-4675-9e3c-e0cd7bfbb746'::uuid),
('7ab5aec9-399e-48c5-88c5-3f456c01cc3a'::uuid, 'ecc4c335-2fa5-461f-b54a-9fbb7ce73334'::uuid),
('99499907-04a0-46f4-9612-140c98428a02'::uuid, '7fe6322e-4331-402f-a49c-3c096f79fcf8'::uuid),
('a621c1cf-655a-4d42-9933-68815125b324'::uuid, '7fe6322e-4331-402f-a49c-3c096f79fcf8'::uuid),
('854cddf4-1b8f-454a-900b-821b936d563c'::uuid, 'ed74b697-c090-4dc4-9534-b6ae0d83d586'::uuid),
('e3402c2b-29ac-4643-a0d0-e42b94441624'::uuid, '8754b037-f70e-4eac-b93b-d3c0cbd8c490'::uuid),
('894051ca-fab6-4716-be93-d0d508b1c26c'::uuid, 'd7f8d7c6-f4eb-4336-afc6-b2735fb5dcea'::uuid),
('98ed4464-8fad-4269-b5ae-b0682af15119'::uuid, 'fa97780d-0bb0-4e6c-ba55-9272c0bf034f'::uuid),
('9cedb6af-278f-4e2a-a77b-9fb0723d149d'::uuid, 'ef3e2298-118e-4881-a542-d09e50e2894e'::uuid),
('b002240a-b2d1-4aaa-93c7-96f4adc7663f'::uuid, 'b7a23015-6cf1-4e37-b131-629248f9355f'::uuid),
('bfe53e7d-2d69-4fbe-b379-6983ad2296e5'::uuid, 'e1e884d2-2d53-4e6e-91bc-41d148979cce'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('49418d47-82c6-471f-9eb2-bb5ea0bd8544'::uuid, 'Joaquín Myszka', 'Joaquín', 'Myszka'),
('05dc6c8c-b31f-4b64-a76c-b5ba4eaf9597'::uuid, 'Ignacio Merli', 'Ignacio', 'Merli'),
('065dad66-81bd-41f5-810c-5e474f23074b'::uuid, 'Francisco Sluga', 'Francisco', 'Sluga'),
('0c93cc8b-bf3d-4716-a73d-b461caa433af'::uuid, 'Pedro Coll', 'Pedro', 'Coll'),
('12397f23-bd76-4eba-a813-eea13ed14bc6'::uuid, 'Joaquín Pascual Viale', 'Joaquín Pascual', 'Viale'),
('16678fb8-afc9-41d4-86e4-3264d6b53444'::uuid, 'Agustín Segura', 'Agustín', 'Segura'),
('71e24d03-08e4-499b-b420-34d32dc17801'::uuid, 'Augusto Villanueva', 'Augusto', 'Villanueva'),
('1b8982b2-ae8a-4411-aa5a-4b7bf8cea3bb'::uuid, 'Francisco Bareiro', 'Francisco', 'Bareiro'),
('da4e4ec9-7445-4dc8-9b1d-c042771a1985'::uuid, 'Tomás Baguley', 'Tomás', 'Baguley'),
('25b64fd6-2e29-4297-aba4-a0b4545ebc7f'::uuid, 'Bautista Farisé', 'Bautista', 'Farisé'),
('9240c615-c186-4110-9d5a-b0963d1a08f8'::uuid, 'Santos María Juarez Estrada', 'Santos María Juarez', 'Estrada'),
('e6075639-63e3-4ff0-8ac5-396340b5253d'::uuid, 'Tomás Dande', 'Tomás', 'Dande'),
('a0d2398b-6030-4139-bd74-8f92b0fcc748'::uuid, 'Enzo Avaca', 'Enzo', 'Avaca'),
('f029b349-f90f-4ec3-8835-57e31979a78b'::uuid, 'Valentín Gozálvez', 'Valentín', 'Gozálvez'),
('e258ec33-18c3-4374-9987-25c40bfc4d2b'::uuid, 'Basilio Cañas', 'Basilio', 'Cañas'),
('3aec989d-510a-480b-9c79-b4604994139e'::uuid, 'Joaquín Mussi', 'Joaquín', 'Mussi'),
('6a3a7a2c-d647-4cc6-8f60-cc1b11642736'::uuid, 'Constantino Keller', 'Constantino', 'Keller'),
('43146d6b-2662-436f-a335-5010e58c89c3'::uuid, 'Juan Manuel Vivas', 'Juan Manuel', 'Vivas'),
('477bfdf0-fced-4434-a20e-6536e545ea8d'::uuid, 'Tomás Vanni', 'Tomás', 'Vanni'),
('fad9f9f6-3517-4785-9e47-63559ba8efb7'::uuid, 'Rodrigo Araya', 'Rodrigo', 'Araya'),
('cd7150fa-b35c-448b-92f7-07919d8f8300'::uuid, 'Mateo Pasquini', 'Mateo', 'Pasquini'),
('8131190b-ae0e-4d95-81ef-4fb3ef9cf9a3'::uuid, 'Mauricio Kember', 'Mauricio', 'Kember'),
('6d938699-e675-4532-8bf9-e747ec1afce7'::uuid, 'Bautista Estellés', 'Bautista', 'Estellés'),
('5e6e2ff5-db1f-4934-bf92-1477be89f25a'::uuid, 'Agustín De Vértiz', 'Agustín De', 'Vértiz'),
('76b306ae-589d-4879-a695-f3aed57c478a'::uuid, 'Genaro Fissore', 'Genaro', 'Fissore'),
('678d745d-4d0a-413f-b116-3ddd237a98be'::uuid, 'Lucas Tulón', 'Lucas', 'Tulón'),
('6ce46fbe-b705-4a06-8fee-b7e928580315'::uuid, 'Bruno Heit', 'Bruno', 'Heit'),
('7254de14-14b7-4675-9e3c-e0cd7bfbb746'::uuid, 'Fabricio Griffo Zaradnik', 'Fabricio Griffo', 'Zaradnik'),
('ecc4c335-2fa5-461f-b54a-9fbb7ce73334'::uuid, 'Martín Escobar', 'Martín', 'Escobar'),
('7fe6322e-4331-402f-a49c-3c096f79fcf8'::uuid, 'Ariel Núñez', 'Ariel', 'Núñez'),
('ed74b697-c090-4dc4-9534-b6ae0d83d586'::uuid, 'Facundo Pueyrredón', 'Facundo', 'Pueyrredón'),
('8754b037-f70e-4eac-b93b-d3c0cbd8c490'::uuid, 'Cristóbal Soto', 'Cristóbal', 'Soto'),
('d7f8d7c6-f4eb-4336-afc6-b2735fb5dcea'::uuid, 'Marcos Camerlinckx', 'Marcos', 'Camerlinckx'),
('fa97780d-0bb0-4e6c-ba55-9272c0bf034f'::uuid, 'Joaquín Suárez', 'Joaquín', 'Suárez'),
('ef3e2298-118e-4881-a542-d09e50e2894e'::uuid, 'Fabián Lagos', 'Fabián', 'Lagos'),
('b7a23015-6cf1-4e37-b131-629248f9355f'::uuid, 'Lucas Marguery', 'Lucas', 'Marguery'),
('e1e884d2-2d53-4e6e-91bc-41d148979cce'::uuid, 'Joaquín Lamas', 'Joaquín', 'Lamas');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_x1_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_x1_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_x1_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_x1_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_x1_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_x1_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_x1_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_x1_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_x1_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_x1_matches);
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
