
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('b58aac77-d0e2-4434-aae9-a2c8177ab16e'::uuid, '785e7f9b-1f8d-4fc6-85b9-eed11032ca95'::uuid),
('48274a4b-0997-45ab-b4a5-d5d097895cdc'::uuid, '68507be0-e0be-42ab-929e-0b5f51055a7f'::uuid),
('6689892c-8b82-4878-b24a-1fd3ac32f2c4'::uuid, '95c0ba42-2572-4463-ab81-538d785f63f7'::uuid),
('c283dc6a-2dac-4381-977b-c2bb66c8f6cd'::uuid, 'd2978936-e5db-43de-8d2d-55543d87edba'::uuid),
('ddf25aa2-5fac-4e2f-b6c5-368e4d06591b'::uuid, '649fe0e8-2ebf-46e6-aa77-e1e70f3303f6'::uuid),
('334b491b-4c4a-48a0-8853-76deb99d7c12'::uuid, '058616e7-dbc8-47f6-91cd-5aa8f98f9e21'::uuid),
('f3467097-80bd-426f-94ce-6adef8eeb290'::uuid, '515d67af-d516-42a3-9175-d4ab9e39e580'::uuid),
('b8fbe1f6-021c-4b20-a766-c867058799b1'::uuid, 'f7bdbece-8460-480c-ae75-ca7a62772b49'::uuid),
('4e15e30f-7974-458f-bfc8-04e4c78477f5'::uuid, 'bfad31aa-97e9-4727-b968-55c69c3898ac'::uuid),
('2d8b44f2-64ac-4128-9372-14adfc2337a3'::uuid, 'ed74b697-c090-4dc4-9534-b6ae0d83d586'::uuid),
('978174b3-d8de-4d4b-aea9-ea3ca75848cf'::uuid, 'd383d4ad-03e2-44a5-84b2-ad461e75d23f'::uuid),
('c7e9014c-2524-4143-974b-51b2c416ffbd'::uuid, '7f9014cc-7291-4d57-a56a-720241744e09'::uuid),
('7ae892b4-215e-46d5-9590-c4cc282135e8'::uuid, '9aa422c1-6d17-4efd-9739-89efc526daf0'::uuid),
('46737475-9725-4688-8821-b0c055eacb62'::uuid, '79837499-e39a-4545-a502-21d0a621a7da'::uuid),
('4280abaa-5d25-4ae2-ba08-ec04af5c108a'::uuid, 'bba18b71-29bb-427a-95b8-011a6324b4b9'::uuid),
('dd6ac77a-3417-4e2f-8d3a-5214c4365859'::uuid, '80b45e6c-ee07-42b1-ad82-ee5dff54f2b7'::uuid),
('ed688bc0-88e4-4929-8719-d5b81749e9d6'::uuid, '80b45e6c-ee07-42b1-ad82-ee5dff54f2b7'::uuid),
('2dda34e1-8e96-4946-ac8d-dee0c71b5500'::uuid, '93faaa3a-0917-4bcc-a7fa-5e172ba0ad9d'::uuid),
('3d6ff98b-37db-4e6b-9498-b66ece902036'::uuid, '93faaa3a-0917-4bcc-a7fa-5e172ba0ad9d'::uuid),
('e0ee577a-9416-41c7-8c72-6c5f835e5205'::uuid, '4f234cfc-3993-489b-b841-abc999284fc5'::uuid),
('e94e8afc-fcea-4421-90ac-46c5292a9e9f'::uuid, '206de5bf-fc71-47b6-af4f-291ae1377afb'::uuid),
('48965b85-89aa-4cb4-b749-1f247c8a14f3'::uuid, 'c618dd4e-c999-430b-8693-c934a6c9a65c'::uuid),
('7d2e3114-7718-408c-a448-c70786016f06'::uuid, 'f6cc31e6-6e7c-4138-afbe-dbb1c74350dc'::uuid),
('0669d460-0332-4809-866f-31e12b62e6d9'::uuid, '61773e17-1279-4274-b2cc-d50e0f03541c'::uuid),
('f7172bad-7457-4e39-8fb1-dcf3bc83a154'::uuid, '901ffb41-717a-4081-b4ff-d0c94e645974'::uuid),
('055e9898-e258-4f9c-b1ac-487695a104bd'::uuid, 'cbc01a7e-4257-4dd6-ba30-281b64080b23'::uuid),
('ea3faaa2-21f2-4bfd-a6a1-2a37454fcd4a'::uuid, 'e54c1965-f236-4d2c-8249-5fed56f7d3c7'::uuid),
('ae6ea93e-0c5b-4de8-9660-b02867a4ac1f'::uuid, 'aab7ed6c-6828-4073-ab2c-14d15aca7b64'::uuid),
('cf576af3-fc72-426a-af61-6a34658bffe3'::uuid, '51277e61-d6a0-4ae6-a88f-ca7b5d66d4ed'::uuid),
('9a99530a-39ae-4669-92ae-ecae914633cf'::uuid, 'bc0143c2-bd63-4b3d-85f8-e1ca2125a0f9'::uuid),
('92fa7f3b-2005-4a33-a1fb-3a99076ea2c6'::uuid, 'a0190be3-782e-440a-926e-d37822458feb'::uuid),
('ca99cb6a-ed8a-4a38-bf6c-8e0fd9a2c2b9'::uuid, '39d0f025-ef06-4ff3-848d-139b100d7bc2'::uuid),
('5ec06e2e-bbaf-4c02-b041-29a6ab35e639'::uuid, '1ea1011a-c0ab-497a-8983-83f998b7bf2e'::uuid),
('aa9d0663-3a7c-46e3-9e55-a72bffd355ee'::uuid, '5d03c0e2-59f8-4506-b50b-af4c0427cd3f'::uuid),
('3011caf2-298c-44d8-9a40-406fc8781219'::uuid, '9240c615-c186-4110-9d5a-b0963d1a08f8'::uuid),
('f45261b6-c9a2-4630-8931-923b6949784e'::uuid, '092a2bd8-3d00-493a-bfbc-ce2f4005a0e8'::uuid),
('95b7695f-92f1-48b1-9642-ee8d435b3a12'::uuid, 'f8d8cf41-c00b-4a6f-a37a-cbd439e3c43f'::uuid),
('7bf37923-29e3-4876-9a8e-3a5a3db4b0ce'::uuid, '7bdadced-0b2b-497c-9c7b-cbae697517d2'::uuid),
('97b45d60-bb88-4c9f-b9bd-e1ac924f06fa'::uuid, '1fd048f2-99f4-4323-b238-cc968584d3ff'::uuid),
('8d023586-97df-487b-929f-ab12c5e78d54'::uuid, '606893fc-018d-4811-a49d-4ffe487b8ffa'::uuid),
('cb4ae963-a835-4a0a-bc92-8f7203cb5b06'::uuid, '4529ccfb-1215-4dbb-bd39-f1100ed74841'::uuid),
('e5e2240f-c2fc-45fb-83f0-6b2dc9f4ef26'::uuid, 'f6e89252-ea4f-4e83-95ee-b401dbe7d8b1'::uuid),
('b08ec765-6085-415e-8594-438bf4161e0b'::uuid, 'c5a2b62b-dea8-41e1-9851-f682a78595e0'::uuid),
('be6af14d-a78e-43a6-b935-bfef5778d94e'::uuid, 'c5a2b62b-dea8-41e1-9851-f682a78595e0'::uuid),
('78156619-d624-40c7-a0e8-09c0027bac52'::uuid, '36aa6fde-14e3-4e81-9ffb-2f088848f73f'::uuid),
('98e171cb-88ad-4104-a438-60a82c9cf9bd'::uuid, '7aaf8e33-ab93-46b5-b2de-4def22be25df'::uuid),
('687b5fcf-395c-4fc8-82a9-41427c2adcf1'::uuid, 'a420b42f-0aba-4231-b317-4552211e2a6c'::uuid),
('81d21e74-77f7-4e22-a7ac-656999bb0cfb'::uuid, 'a420b42f-0aba-4231-b317-4552211e2a6c'::uuid),
('17e71a91-fe6f-4808-b54a-1a3f189b36cf'::uuid, 'c61e71d5-13d8-40c1-832c-8b769b58a013'::uuid),
('02e310c9-3078-462c-8bd7-805541ffa2dd'::uuid, 'da992dbc-32d6-4140-b43e-ea331856e860'::uuid),
('683e74b4-dd48-45c1-81c1-d56bc3fb4f2d'::uuid, 'da992dbc-32d6-4140-b43e-ea331856e860'::uuid),
('6c74d30b-69a8-4bfd-98c1-e3b8538c0269'::uuid, 'da992dbc-32d6-4140-b43e-ea331856e860'::uuid),
('bc4055cc-99e2-4530-8dd2-b78f0b452792'::uuid, 'da992dbc-32d6-4140-b43e-ea331856e860'::uuid),
('2bd87fc2-1a39-4969-b4e1-92a5ffe5f56c'::uuid, 'a261b684-5f16-4b6d-ba4b-b027960ee800'::uuid),
('97078f67-1c1e-43e7-a255-adc5b4152ac5'::uuid, 'dc64b85c-dc07-48c6-94f4-d5787277489a'::uuid),
('6c2419da-8534-4390-b565-e5a14df415f4'::uuid, '327d84a4-c3eb-4cdc-894c-483c669952aa'::uuid),
('7c56dbe0-9a2c-43c7-96b0-f129dabc1bb2'::uuid, '7b43edb7-8e64-4f6d-901e-06128c158b96'::uuid),
('2bd702b9-edcb-4da0-9c54-b73d0cdde0a8'::uuid, '50991c32-7bc7-41ee-bcd0-6b24f86f91d1'::uuid),
('cfd7dde8-95f6-4215-883c-cf89361f4bc3'::uuid, 'b21c42f9-80db-4526-aae4-1dc6f3873d4e'::uuid),
('44fc9831-8013-46f5-a385-708fd06acb1d'::uuid, 'd6a7efcc-9224-42d7-bb81-a0d2c1913506'::uuid),
('4396d1f9-afa6-4e87-a92e-97daa1b04236'::uuid, '2faec52a-079c-4895-a91f-cafb98d1dda4'::uuid),
('2afa0b22-0d77-40da-8c9a-c21aa799bff7'::uuid, '0c723a09-ec3f-4603-b4cf-b477ce41c78d'::uuid),
('d45ee4e9-026a-4f9b-ba7f-b181247cc4f0'::uuid, '3620d519-a141-4f40-aeaa-8124f2767f2d'::uuid),
('6db093d7-f8cf-4df9-8248-23e9e734c8a6'::uuid, 'c946dfe7-4538-4084-acd6-798ed61fc1ce'::uuid),
('6cb79b40-4952-43ab-a121-e1e6e5331c97'::uuid, 'bef2d38e-44c2-43c2-9f54-beab15bdf181'::uuid),
('1649a427-bddb-4da6-9a52-b25d2823ebc0'::uuid, '38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid),
('a75ba46e-9c4a-4884-8992-79679eb04242'::uuid, 'c1231095-d3ca-410c-8f9d-21422c003b25'::uuid),
('94553851-a2c1-42bc-8b33-44fe078f9313'::uuid, '3792e7f0-0f7b-495c-b39f-e7e459f44109'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('785e7f9b-1f8d-4fc6-85b9-eed11032ca95'::uuid, 'Javier Diaz Otañez', 'Javier Diaz', 'Otañez'),
('68507be0-e0be-42ab-929e-0b5f51055a7f'::uuid, 'Calos Facundo Molina Martinez', 'Calos Facundo Molina', 'Martinez'),
('95c0ba42-2572-4463-ab81-538d785f63f7'::uuid, 'Gino Amata', 'Gino', 'Amata'),
('d2978936-e5db-43de-8d2d-55543d87edba'::uuid, 'Estanislao Gomez Fernandez', 'Estanislao', 'Gomez Fernandez'),
('649fe0e8-2ebf-46e6-aa77-e1e70f3303f6'::uuid, 'Federico Rolotti', 'Federico', 'Rolotti'),
('058616e7-dbc8-47f6-91cd-5aa8f98f9e21'::uuid, 'Francisco Udrisard', 'Francisco', 'Udrisard'),
('515d67af-d516-42a3-9175-d4ab9e39e580'::uuid, 'Franco Feretti', 'Franco', 'Feretti'),
('f7bdbece-8460-480c-ae75-ca7a62772b49'::uuid, 'Tomás Altamira', 'Tomás', 'Altamira'),
('bfad31aa-97e9-4727-b968-55c69c3898ac'::uuid, 'Federico Gutierrez Marquez', 'Federico Gutierrez', 'Marquez'),
('ed74b697-c090-4dc4-9534-b6ae0d83d586'::uuid, 'Facundo Pueyrredon', 'Facundo', 'Pueyrredon'),
('d383d4ad-03e2-44a5-84b2-ad461e75d23f'::uuid, 'Mateo Yamil Gonzalez', 'Mateo Yamil', 'Gonzalez'),
('7f9014cc-7291-4d57-a56a-720241744e09'::uuid, 'Pedro Francisco Berrotaran Robinet', 'Pedro Francisco Berrotaran', 'Robinet'),
('9aa422c1-6d17-4efd-9739-89efc526daf0'::uuid, 'Santiago Barrera', 'Santiago', 'Barrera'),
('79837499-e39a-4545-a502-21d0a621a7da'::uuid, 'Santiago Iarossi', 'Santiago', 'Iarossi'),
('bba18b71-29bb-427a-95b8-011a6324b4b9'::uuid, 'Gino Luca Genari', 'Gino Luca', 'Genari'),
('80b45e6c-ee07-42b1-ad82-ee5dff54f2b7'::uuid, 'Agustín Homero Cañas', 'Agustín Homero', 'Cañas'),
('93faaa3a-0917-4bcc-a7fa-5e172ba0ad9d'::uuid, 'Benjamin Marmol Maldonado', 'Benjamin Marmol', 'Maldonado'),
('4f234cfc-3993-489b-b841-abc999284fc5'::uuid, 'Ismael Vera', 'Ismael', 'Vera'),
('206de5bf-fc71-47b6-af4f-291ae1377afb'::uuid, 'Benjamin Nakasone Uema', 'Benjamin Nakasone', 'Uema'),
('c618dd4e-c999-430b-8693-c934a6c9a65c'::uuid, 'Jeremias Chiappero', 'Jeremias', 'Chiappero'),
('f6cc31e6-6e7c-4138-afbe-dbb1c74350dc'::uuid, 'Renzo Farrando', 'Renzo', 'Farrando'),
('61773e17-1279-4274-b2cc-d50e0f03541c'::uuid, 'Luis Tomas Del Canto', 'Luis Tomas Del', 'Canto'),
('901ffb41-717a-4081-b4ff-d0c94e645974'::uuid, 'Camilo Gomez Perez', 'Camilo Gomez', 'Perez'),
('cbc01a7e-4257-4dd6-ba30-281b64080b23'::uuid, 'Juan Manuel Bonadeo', 'Juan Manuel', 'Bonadeo'),
('e54c1965-f236-4d2c-8249-5fed56f7d3c7'::uuid, 'Lucas Matias Ponzo', 'Lucas Matias', 'Ponzo'),
('aab7ed6c-6828-4073-ab2c-14d15aca7b64'::uuid, 'Matias Mariano Gomez', 'Matias Mariano', 'Gomez'),
('51277e61-d6a0-4ae6-a88f-ca7b5d66d4ed'::uuid, 'Nicolás Ezequiel Aspera Contreras', 'Nicolás Ezequiel Aspera', 'Contreras'),
('bc0143c2-bd63-4b3d-85f8-e1ca2125a0f9'::uuid, 'Joaquin Alejandro Castillo Ceballos', 'Joaquin Alejandro Castillo', 'Ceballos'),
('a0190be3-782e-440a-926e-d37822458feb'::uuid, 'Simon Cabello Molina', 'Simon Cabello', 'Molina'),
('39d0f025-ef06-4ff3-848d-139b100d7bc2'::uuid, 'Maximiliano Gimenez Porporatto', 'Maximiliano Gimenez', 'Porporatto'),
('1ea1011a-c0ab-497a-8983-83f998b7bf2e'::uuid, 'Ignacio Navarro', 'Ignacio', 'Navarro'),
('5d03c0e2-59f8-4506-b50b-af4c0427cd3f'::uuid, 'Tomás Díaz', 'Tomás', 'Díaz'),
('9240c615-c186-4110-9d5a-b0963d1a08f8'::uuid, 'Santos Maria Juarez Estrada', 'Santos Maria Juarez', 'Estrada'),
('092a2bd8-3d00-493a-bfbc-ce2f4005a0e8'::uuid, 'Raúl Santino Colombo', 'Raúl Santino', 'Colombo'),
('f8d8cf41-c00b-4a6f-a37a-cbd439e3c43f'::uuid, 'Conrado Cortés', 'Conrado', 'Cortés'),
('7bdadced-0b2b-497c-9c7b-cbae697517d2'::uuid, 'Tomas Cardona Allende', 'Tomas Cardona', 'Allende'),
('1fd048f2-99f4-4323-b238-cc968584d3ff'::uuid, 'Valentin Sosa', 'Valentin', 'Sosa'),
('606893fc-018d-4811-a49d-4ffe487b8ffa'::uuid, 'Francisco Gabriel Cavaglia', 'Francisco Gabriel', 'Cavaglia'),
('4529ccfb-1215-4dbb-bd39-f1100ed74841'::uuid, 'Valentin Rodriguez', 'Valentin', 'Rodriguez'),
('f6e89252-ea4f-4e83-95ee-b401dbe7d8b1'::uuid, 'Daniel Aguiriano', 'Daniel', 'Aguiriano'),
('c5a2b62b-dea8-41e1-9851-f682a78595e0'::uuid, 'Juan Ignacio Greising Revol', 'Juan Ignacio Greising', 'Revol'),
('36aa6fde-14e3-4e81-9ffb-2f088848f73f'::uuid, 'Valentín Gozálvez', 'Valentín', 'Gozálvez'),
('7aaf8e33-ab93-46b5-b2de-4def22be25df'::uuid, 'Gastón Garayzabal', 'Gastón', 'Garayzabal'),
('a420b42f-0aba-4231-b317-4552211e2a6c'::uuid, 'Faustino Sánchez', 'Faustino', 'Sánchez'),
('c61e71d5-13d8-40c1-832c-8b769b58a013'::uuid, 'Tomás Montilla', 'Tomás', 'Montilla'),
('da992dbc-32d6-4140-b43e-ea331856e860'::uuid, 'Tomás Gómez González', 'Tomás Gómez', 'González'),
('a261b684-5f16-4b6d-ba4b-b027960ee800'::uuid, 'Nicolás Revol Pitt', 'Nicolás Revol', 'Pitt'),
('dc64b85c-dc07-48c6-94f4-d5787277489a'::uuid, 'Leandro Martin Nassif', 'Leandro Martin', 'Nassif'),
('327d84a4-c3eb-4cdc-894c-483c669952aa'::uuid, 'Lucas Busdrago Marinelli', 'Lucas Busdrago', 'Marinelli'),
('7b43edb7-8e64-4f6d-901e-06128c158b96'::uuid, 'Agustin Martinez Ferreyra', 'Agustin Martinez', 'Ferreyra'),
('50991c32-7bc7-41ee-bcd0-6b24f86f91d1'::uuid, 'Jeremias Trigg', 'Jeremias', 'Trigg'),
('b21c42f9-80db-4526-aae4-1dc6f3873d4e'::uuid, 'David Di Tommaso', 'David Di', 'Tommaso'),
('d6a7efcc-9224-42d7-bb81-a0d2c1913506'::uuid, 'Ignacio Valentin Lencina Gimenez', 'Ignacio Valentin Lencina', 'Gimenez'),
('2faec52a-079c-4895-a91f-cafb98d1dda4'::uuid, 'Valentín Soler Filloy', 'Valentín', 'Soler Filloy'),
('0c723a09-ec3f-4603-b4cf-b477ce41c78d'::uuid, 'Gregorio Hernández Cardinali', 'Gregorio', 'Hernández Cardinali'),
('3620d519-a141-4f40-aeaa-8124f2767f2d'::uuid, 'Ignacio Díaz Centeno', 'Ignacio', 'Díaz Centeno'),
('c946dfe7-4538-4084-acd6-798ed61fc1ce'::uuid, 'Facundo Nicolás Ortiz', 'Facundo Nicolás', 'Ortiz'),
('bef2d38e-44c2-43c2-9f54-beab15bdf181'::uuid, 'Tomás Acevedo Ferreyra', 'Tomás', 'Acevedo Ferreyra'),
('38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid, 'Hilario Fernández Frontera', 'Hilario', 'Fernández Frontera'),
('c1231095-d3ca-410c-8f9d-21422c003b25'::uuid, 'Vicente Pez7utti', 'Vicente', 'Pez7utti'),
('3792e7f0-0f7b-495c-b39f-e7e459f44109'::uuid, 'Ignacio Gabriel Farias Decarlini', 'Ignacio Gabriel Farias', 'Decarlini');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_d_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_d_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_d_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_d_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_d_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_d_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_d_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_d_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_d_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_d_matches);
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
