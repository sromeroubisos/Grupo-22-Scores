begin;
create table bak_renombres_cba_20261029_people as select * from people where id in (('10b7ea36-f85c-4823-a3eb-de1145e0241b',('16d653f2-4f1c-41eb-afe0-4b707d333bdd',('337e1de8-96a7-4946-8dd4-7de07cb8f5bd',('3dae09f4-734b-4ef7-8ee7-afda6941e5d4',('473a1d94-16c7-4512-a806-7cb1fa887696',('4fa49b75-e01e-418d-9e61-cc1d3987f69b',('7104a45d-9127-456f-8465-c555ddf71392',('aa013745-e3be-4fa4-ac5c-32c764fea118',('aa0353e8-fab1-42b6-9a48-19039463b583',('cfcd4d04-32c4-4377-9c1a-eb9cd8530bba',('da2aafcd-cccd-4f84-af57-b67558851167',('f87c9c87-4989-453f-b47c-d8918da50919',('0e47d29f-0696-47cd-8f98-b0d9c5c06a78',('4cdb53b5-8fc4-4cf5-b891-adf22325bcb8',('4e76bc86-54ba-4364-a378-a2aea62a7790',('79e4fe79-2269-4443-8533-822977d0f622',('7fd87100-a936-45cb-bf78-1fddd9a07be1',('a8299960-c39f-4668-9630-be3c1732a7b7',('b6bcfe02-053e-45bb-835b-ab96231ed2c9',('cd020cb7-146c-4520-a806-00965f5bf53a',('f7e93cd8-63ed-446a-8725-a3b06d89eeb7',('0616cd6e-012e-49ea-9189-b5715682c670',('29c9406d-171c-4c09-97f6-b52aa3e8efd9',('3137ea8f-b9d3-48bf-8a54-c581cfdedd3e',('514d1000-f225-40a4-acc4-c57f5dbd34f5',('70e5c00e-318b-4666-ab39-a47c690ca48f',('c828b784-9dd5-4904-a747-b6182f32fd4b',('1c4f0903-62ef-4df4-ae0a-0ddf9b9b8617',('2abde64c-5941-40d7-b926-055a7e919eb1',('5f4fcfa6-954f-4ec2-b69c-5a21742b51ed',('cdd0d01e-4dc4-4901-a268-b8352c619825',('e8f9e541-4f59-4c51-ad4f-670fd520e12e',('f7fe55de-7142-4f01-8c8e-74f28a5343a7',('5e6e2ff5-db1f-4934-bf92-1477be89f25a',('ae774f30-5576-4092-99b6-44e65dd2a89c',('0b335fd2-bf50-47b5-acae-4d7f14460f7c',('0f54f0e8-1dbf-43c6-9523-ebd28707ff1d',('8214e8f3-de6c-4fb4-ac71-e365f3a5a375',('b7e7804d-2cf9-440d-977c-7eb6c2353e8b');
create temp table rn(id uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into rn values
('10b7ea36-f85c-4823-a3eb-de1145e0241b'::uuid,'Matías Marchesin Kossoy','Matías Marchesin','Kossoy'),
('16d653f2-4f1c-41eb-afe0-4b707d333bdd'::uuid,'Jerónimo Osores','Jerónimo','Osores'),
('337e1de8-96a7-4946-8dd4-7de07cb8f5bd'::uuid,'Lautaro Díaz','Lautaro','Díaz'),
('3dae09f4-734b-4ef7-8ee7-afda6941e5d4'::uuid,'Nicolás Roger Farías','Nicolás Roger','Farías'),
('473a1d94-16c7-4512-a806-7cb1fa887696'::uuid,'Joaquín Minardi','Joaquín','Minardi'),
('4fa49b75-e01e-418d-9e61-cc1d3987f69b'::uuid,'Santiago Meyer','Santiago','Meyer'),
('7104a45d-9127-456f-8465-c555ddf71392'::uuid,'Martín Sanchez','Martín','Sanchez'),
('aa013745-e3be-4fa4-ac5c-32c764fea118'::uuid,'Arian Nicolás Bello','Arian Nicolás','Bello'),
('aa0353e8-fab1-42b6-9a48-19039463b583'::uuid,'Agustín Ricardo Rosales Paur','Agustín Ricardo Rosales','Paur'),
('cfcd4d04-32c4-4377-9c1a-eb9cd8530bba'::uuid,'Nahuel Francisco Kaper','Nahuel Francisco','Kaper'),
('da2aafcd-cccd-4f84-af57-b67558851167'::uuid,'Agustín Bur','Agustín','Bur'),
('f87c9c87-4989-453f-b47c-d8918da50919'::uuid,'Joaquín Soldevila','Joaquín','Soldevila'),
('0e47d29f-0696-47cd-8f98-b0d9c5c06a78'::uuid,'Manuel Valentín Quintana','Manuel Valentín','Quintana'),
('4cdb53b5-8fc4-4cf5-b891-adf22325bcb8'::uuid,'Martín Quiñonero','Martín','Quiñonero'),
('4e76bc86-54ba-4364-a378-a2aea62a7790'::uuid,'Matías Daniel Jabase','Matías Daniel','Jabase'),
('79e4fe79-2269-4443-8533-822977d0f622'::uuid,'Nicolás Visconti','Nicolás','Visconti'),
('7fd87100-a936-45cb-bf78-1fddd9a07be1'::uuid,'Nicolás Godoy','Nicolás','Godoy'),
('a8299960-c39f-4668-9630-be3c1732a7b7'::uuid,'Agustín Pérez Soria','Agustín Pérez','Soria'),
('b6bcfe02-053e-45bb-835b-ab96231ed2c9'::uuid,'Facundo López Lopez','Facundo Lopez','Lopez'),
('cd020cb7-146c-4520-a806-00965f5bf53a'::uuid,'Matías Tomás Peralta Banegas','Matías Tomás Peralta','Banegas'),
('f7e93cd8-63ed-446a-8725-a3b06d89eeb7'::uuid,'Lautaro José Garzón','Lautaro José','Garzón'),
('0616cd6e-012e-49ea-9189-b5715682c670'::uuid,'Pedro Benjamín Yapur','Pedro Benjamín','Yapur'),
('29c9406d-171c-4c09-97f6-b52aa3e8efd9'::uuid,'Einel Iñaki Knorr','Einel Iñaki','Knorr'),
('3137ea8f-b9d3-48bf-8a54-c581cfdedd3e'::uuid,'Matías Fischer','Matías','Fischer'),
('514d1000-f225-40a4-acc4-c57f5dbd34f5'::uuid,'Agustín Peralta','Agustín','Peralta'),
('70e5c00e-318b-4666-ab39-a47c690ca48f'::uuid,'Matías Fischer','Matías','Fischer'),
('c828b784-9dd5-4904-a747-b6182f32fd4b'::uuid,'Valentín Pieretto Heiland','Valentín Pieretto','Heiland'),
('1c4f0903-62ef-4df4-ae0a-0ddf9b9b8617'::uuid,'Valentín Tomas Aguero','Valentín Tomas','Aguero'),
('2abde64c-5941-40d7-b926-055a7e919eb1'::uuid,'Pedro Benjamín Yapur','Pedro Benjamín','Yapur'),
('5f4fcfa6-954f-4ec2-b69c-5a21742b51ed'::uuid,'Valentín Pigni','Valentín','Pigni'),
('cdd0d01e-4dc4-4901-a268-b8352c619825'::uuid,'Valentino Marín','Valentino','Marín'),
('e8f9e541-4f59-4c51-ad4f-670fd520e12e'::uuid,'Martín Montero','Martín','Montero'),
('f7fe55de-7142-4f01-8c8e-74f28a5343a7'::uuid,'Benjamín Farías','Benjamín','Farías'),
('5e6e2ff5-db1f-4934-bf92-1477be89f25a'::uuid,'Agustín De Vértiz','Agustín De','Vértiz'),
('ae774f30-5576-4092-99b6-44e65dd2a89c'::uuid,'Agustín Achaval','Agustín','Achaval'),
('0b335fd2-bf50-47b5-acae-4d7f14460f7c'::uuid,'Julián Conti','Julián','Conti'),
('0f54f0e8-1dbf-43c6-9523-ebd28707ff1d'::uuid,'Tomás Principe','Tomás','Principe'),
('8214e8f3-de6c-4fb4-ac71-e365f3a5a375'::uuid,'Tomás Baudino','Tomás','Baudino'),
('b7e7804d-2cf9-440d-977c-7eb6c2353e8b'::uuid,'Mauro Agustín Palacios','Mauro Agustín','Palacios');
update people p set full_name=rn.full_name, first_name=rn.first_name, last_name=rn.last_name from rn where p.id=rn.id;
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when rn.id is not null then x.e || jsonb_build_object('name', rn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join rn on rn.id::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where m.lineups::text ~ (select string_agg(id::text,'|') from rn);
update match_events me set player_name = rn.full_name,
  details = case when me.details ? 'playerName' then me.details || jsonb_build_object('playerName', rn.full_name) else me.details end
  from rn where me.player_id = rn.id;
commit;
