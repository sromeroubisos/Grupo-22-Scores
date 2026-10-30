
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('a31bb7a8-386e-4424-99d4-92e42dd074ad'::uuid, '08b4f8ec-c721-4849-8d36-a3c6cebc4289'::uuid),
('fdb11b63-9410-4287-ac9c-61d12ab45252'::uuid, '1475b0f7-6f50-4829-b27b-eebd92a60b72'::uuid),
('3230df7c-7ba6-4972-b70e-b04f407dedae'::uuid, '4429db7e-1d52-48e2-a717-27c0fd4190e9'::uuid),
('3c662daa-9157-4dcf-9275-49f7da97b894'::uuid, '9bbd8cde-2c78-484c-8fd5-29a3a6921047'::uuid),
('682b1476-eadb-4d43-bbed-e68138376ba1'::uuid, '3f6a8c86-982d-4557-8b53-688418118fb3'::uuid),
('c6890bbf-affd-41d8-9d7c-6f30f2abe73e'::uuid, '6f4083f0-7955-4ffc-8b54-3905e94fda7e'::uuid),
('e7416adc-d787-4d32-85df-a43d9b3332ea'::uuid, 'bd6f950b-ecce-4f55-9232-21fcc033b621'::uuid),
('31824f81-7253-47ec-ad02-67df318befd0'::uuid, '51277e61-d6a0-4ae6-a88f-ca7b5d66d4ed'::uuid),
('7bd29928-4310-4ede-9e29-59e8d4db8854'::uuid, 'e2ac50d4-3de8-4e72-8551-cd2da5926c7a'::uuid),
('2bad3eeb-9cd2-4be7-8c92-de0cd7bb244b'::uuid, 'fda4f571-a7e4-4f6b-9fac-b4742b59e41f'::uuid),
('aab7ed6c-6828-4073-ab2c-14d15aca7b64'::uuid, '46d70516-8886-45af-b5ef-c39f58ef1c67'::uuid),
('9155c9e4-c1e9-4f47-8d8e-ae4c55b12aa4'::uuid, '7c8e74d4-79c0-418b-a762-a208f0c33e42'::uuid),
('01a8b489-63f1-4d02-922d-37485c9a8b1d'::uuid, '58c97c98-d29d-42c2-9a6d-2ac5f822bc35'::uuid),
('b77ea978-7b35-499e-b805-11e9e9c918af'::uuid, '55cc278e-9c65-437c-ad53-81623c1bc56b'::uuid),
('ad930603-f4d0-4073-98c6-d43b618954cd'::uuid, '837ab11f-f0b4-4e22-94c6-a68a88779d3f'::uuid),
('96fa219e-bdf5-4b62-8b14-a2744b3cae99'::uuid, '84fa105d-6bbc-49e0-ade3-88247cfea437'::uuid),
('76862cec-fcbb-4dbc-b890-a20ac9c6ed47'::uuid, '068c791a-ffd6-4473-a6f0-fa9ed5c040ff'::uuid),
('19177c2b-a853-4a77-8248-40ae7521c306'::uuid, 'f6dc3c99-7016-414e-aa1f-64e82f79f54c'::uuid),
('28c58e47-ad5b-49d9-bef6-7dd66f29363a'::uuid, '42a8507b-3213-4821-b92d-255acc644448'::uuid),
('3bab13c4-81a9-49fb-88c9-bb706ce05a9f'::uuid, 'e00fed55-47e6-4c5f-8cb4-d70ae9a9fff6'::uuid),
('b4f4b862-241e-435e-a373-94a2ce462dfc'::uuid, '8bc97f7c-609a-4efe-9db0-aecab6727bbf'::uuid),
('b84bf39d-34ab-4f1d-8abb-20b433ce43d1'::uuid, '8e86c3cd-bd87-49f5-a731-ec79b8012e7c'::uuid),
('b52f4735-ed7c-4760-a9c2-946f2976a9c5'::uuid, 'cfdb4e07-3fbb-49b9-9af8-b42768e23e24'::uuid),
('0a9511c2-8cc5-4f7c-837c-f6dd4e82cd4e'::uuid, 'cbfaa6fe-5991-4029-987a-08ff7d8cf664'::uuid),
('eccb830e-3769-4a4c-a96e-bd5bae46124c'::uuid, '40fa7490-78c3-46da-a1e6-c305af65055f'::uuid),
('8c50d2d5-877b-4b2c-9a81-024ff27e643b'::uuid, '5ac822aa-7fe2-4a36-82d3-16dc52659991'::uuid),
('66325672-617c-4dd3-ae48-7d9c723e2d87'::uuid, 'a0296d84-3c16-41be-81a9-ec81f2d61a1d'::uuid),
('88239004-f43c-44f3-aa34-2b1a9898361d'::uuid, '8c3c13ed-b933-4a39-8f60-e526af4a896e'::uuid),
('c2430f5d-d936-499b-91b9-56c140ed5669'::uuid, 'eee08568-846a-4df9-a786-9fca461bee45'::uuid),
('ce56e33b-a680-4a26-8e29-0eeec8b46b2f'::uuid, 'cad6d344-517e-42f4-8eef-04be3a2c6ca4'::uuid),
('0391aaa3-1951-48b4-8a5c-c179ea110481'::uuid, 'e283027c-78fc-46d2-af05-62d18150e311'::uuid),
('20c41942-c2e4-45dd-bf4f-7059b6edbbb7'::uuid, '3699089c-92d9-4a77-a7d5-c9b5e909430f'::uuid),
('26a0c389-dea7-4fd7-9625-9ea2ea9cfe43'::uuid, 'c54b45fe-84f8-4e7b-9a8f-b803c2620172'::uuid),
('9b8abef1-2f1a-4ca8-8150-f25f64b867ce'::uuid, '327d84a4-c3eb-4cdc-894c-483c669952aa'::uuid),
('e0b82ddc-6ff2-4fe5-b5fd-483a0321a2d1'::uuid, 'a2ec2e41-9149-40e4-b899-bf0fefd2045f'::uuid),
('058f0e45-b6a3-446e-b246-899534e207b5'::uuid, '5c512e07-5d01-48d1-95d5-da2b6687bf29'::uuid),
('6df77f17-b7ae-4275-a4b5-3bf5c0347aa2'::uuid, '136609a4-a46b-4f25-8848-f907c2700597'::uuid),
('fe4b0beb-e594-4cec-92e3-6daef254fb70'::uuid, '2191bdd1-ea53-4080-b382-61e1a0b90981'::uuid),
('7b74f4bf-7a9e-453d-a409-092b05be167b'::uuid, '474780ca-83fe-466e-a89a-babb768015dd'::uuid),
('3b429d62-e839-4f1c-bc99-b8f582004114'::uuid, '78cd72e4-12b5-43c9-90b6-a853ccda2e0c'::uuid),
('44c0d83e-a8d8-402d-b365-6b35ded5ae90'::uuid, '7745da08-4d31-4595-81e3-069ed9ed5145'::uuid),
('474ce224-f232-4f7e-9633-b291128cf4a9'::uuid, '81b54784-89ff-42a1-9355-af2b6fecf7d7'::uuid),
('b47e38d1-59d8-4817-86ba-4d794c4cf7a5'::uuid, '88366104-b077-48da-ae79-e1c2f359cdc4'::uuid),
('d06be397-132a-4be2-9ca2-0cffe06e7954'::uuid, '9f35bb24-b1d5-4484-a19d-fcdc5ae0319e'::uuid),
('e6bee34a-8fba-4d45-a998-ec7feeeb0055'::uuid, 'ce479bc4-a7ae-48b2-93ad-78c2eef5ed06'::uuid),
('029d07fd-3619-4ae6-95b7-22d304f2ba5e'::uuid, 'a623a664-0c69-44ed-bef2-c6a23c0135f6'::uuid),
('30b4f953-5578-44dc-8395-39760e71e91a'::uuid, '38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid),
('65c6b6fe-c6a4-40ae-9e6e-c30cbb7d470e'::uuid, 'd97cad7e-057d-4b96-9180-2f5a866cc1ca'::uuid),
('c3b64d6e-cf51-4810-80fc-eb7df901d026'::uuid, '0aeef5e9-4a48-4b79-894c-5b0928cd718a'::uuid),
('f899d8b9-a7cd-41e7-ad10-f905f490c94f'::uuid, '14f74871-70aa-4a4a-9359-03d1c6799abb'::uuid),
('18b7c911-8079-4175-a3d0-2fd456af9752'::uuid, 'ffaba68c-92b9-4b85-8399-58d35322bd05'::uuid),
('18d52794-415f-4736-a83b-a35dfe70508e'::uuid, '5d56490f-61bd-4b5c-bd8d-869492fd2092'::uuid),
('6ee18492-1223-4c07-a1ef-4ccf19c2c6ce'::uuid, '23eb5b99-2b75-4371-bdb3-a51479fea9cf'::uuid),
('2749e70d-b0a5-4d30-b49c-a3f089c5135b'::uuid, 'f78459e4-ecb0-4079-86df-4a4e237613ec'::uuid),
('738e3f2d-a4cc-4b0e-ae95-d0d2fc9a1243'::uuid, 'f78459e4-ecb0-4079-86df-4a4e237613ec'::uuid),
('b8e96fac-7737-4e63-aec3-8101f26e0acd'::uuid, '47a1b64e-ebb7-470a-9623-741a8ced67eb'::uuid),
('b2afb1d8-1445-4af2-9f48-34d62d7ecd8e'::uuid, '7a083df9-1276-4947-8988-f4e57d0ca1a3'::uuid),
('c5075e18-2d80-444b-ad6c-040a6c5046f4'::uuid, '8794c13f-290c-418e-ab59-efec97835d9f'::uuid),
('8ce0ae9c-34c3-465e-ae77-8cedaabba87b'::uuid, 'b8e710d4-4aae-4224-b05d-ba4aca8d287e'::uuid),
('ab00c971-1ef5-4a4c-809b-2a0df750f19c'::uuid, 'a0cc29da-cacf-451b-91b2-a2ff31c3ad28'::uuid),
('872da68c-c7d6-4793-b3c3-4313c06ff25a'::uuid, '12561908-a9d0-44c0-bb72-8fdc80298e76'::uuid),
('30bf6160-05b8-475a-95f1-8b5bcac67947'::uuid, '22962931-afb2-4964-8802-2e69dff00f72'::uuid),
('68225fd1-b87d-4556-a12d-c55d262b5184'::uuid, '2aacf595-fa7f-40a9-90b0-bc5fd7eacf3a'::uuid),
('73385ae5-5d4c-458f-bb94-2a653172d42e'::uuid, 'e010ed8a-0f2f-40eb-ab76-fda20083b953'::uuid),
('b219d93a-3d2a-41fc-b4e1-debecac9592a'::uuid, '801e6c67-02fe-43d8-85c0-c3e026e3b910'::uuid),
('8562be00-6fe0-4c10-9651-3590d2930cc1'::uuid, 'c79c7f72-d7a3-4357-9c93-ff602b8b7d35'::uuid),
('d7ce4662-8fda-4610-aab7-d49e8f1f8b2b'::uuid, '8e5c2da0-5f1c-47aa-8301-ae62a511d8e7'::uuid),
('1bd41f27-89e2-4df2-b5a4-42393b1a9f67'::uuid, '940df5b3-361e-4cb1-bc1c-8bb68bcfdcfc'::uuid),
('74284b7c-e724-4b38-8779-260263dfa6bb'::uuid, '747ecbae-2432-4d33-86b1-df9eef45e706'::uuid),
('840c49f7-6e58-451f-a0ec-8056307b0672'::uuid, 'b1c622cc-f0cc-44ae-923a-95effea60106'::uuid),
('f8efe121-d561-4aa8-9e2a-ebaac3f2c414'::uuid, 'c0d5abe9-342c-45e6-b180-ccfa4286ab8a'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('08b4f8ec-c721-4849-8d36-a3c6cebc4289'::uuid, 'Nicolás Revol Pitt', 'Nicolás Revol', 'Pitt'),
('1475b0f7-6f50-4829-b27b-eebd92a60b72'::uuid, 'Martín Tobal', 'Martín', 'Tobal'),
('4429db7e-1d52-48e2-a717-27c0fd4190e9'::uuid, 'Alfredo Pueyrredón', 'Alfredo', 'Pueyrredón'),
('9bbd8cde-2c78-484c-8fd5-29a3a6921047'::uuid, 'Nicolás Hitt Reyes', 'Nicolás Hitt', 'Reyes'),
('3f6a8c86-982d-4557-8b53-688418118fb3'::uuid, 'Ramiro Valdés Iribarren', 'Ramiro', 'Valdés Iribarren'),
('6f4083f0-7955-4ffc-8b54-3905e94fda7e'::uuid, 'Carlos Facundo Nahuel Molina Martinez', 'Carlos Facundo Nahuel', 'Molina Martinez'),
('bd6f950b-ecce-4f55-9232-21fcc033b621'::uuid, 'Agustín Basly', 'Agustín', 'Basly'),
('51277e61-d6a0-4ae6-a88f-ca7b5d66d4ed'::uuid, 'Nicolás Ezequiel Aspera Contreras', 'Nicolás Ezequiel Aspera', 'Contreras'),
('e2ac50d4-3de8-4e72-8551-cd2da5926c7a'::uuid, 'Facundo Amezaga', 'Facundo', 'Amezaga'),
('fda4f571-a7e4-4f6b-9fac-b4742b59e41f'::uuid, 'Nicolás Gaston Garafulic', 'Nicolás Gaston', 'Garafulic'),
('46d70516-8886-45af-b5ef-c39f58ef1c67'::uuid, 'Matías Mariano Gómez', 'Matías Mariano', 'Gómez'),
('7c8e74d4-79c0-418b-a762-a208f0c33e42'::uuid, 'Joaquin Sanchez Salguero', 'Joaquin Sanchez', 'Salguero'),
('58c97c98-d29d-42c2-9a6d-2ac5f822bc35'::uuid, 'Benjamín Cafure', 'Benjamín', 'Cafure'),
('55cc278e-9c65-437c-ad53-81623c1bc56b'::uuid, 'Facundo Nicolás Marengo', 'Facundo Nicolás', 'Marengo'),
('837ab11f-f0b4-4e22-94c6-a68a88779d3f'::uuid, 'Joaquin Moyano Pinchasowicz', 'Joaquin Moyano', 'Pinchasowicz'),
('84fa105d-6bbc-49e0-ade3-88247cfea437'::uuid, 'Luciano Zalazar Castellanos', 'Luciano Zalazar', 'Castellanos'),
('068c791a-ffd6-4473-a6f0-fa9ed5c040ff'::uuid, 'Joaquín Ameijeiras', 'Joaquín', 'Ameijeiras'),
('f6dc3c99-7016-414e-aa1f-64e82f79f54c'::uuid, 'Facundo Agustín Vergara', 'Facundo Agustín', 'Vergara'),
('42a8507b-3213-4821-b92d-255acc644448'::uuid, 'Tomás Salva', 'Tomás', 'Salva'),
('e00fed55-47e6-4c5f-8cb4-d70ae9a9fff6'::uuid, 'Jerónimo Aramayo', 'Jerónimo', 'Aramayo'),
('8bc97f7c-609a-4efe-9db0-aecab6727bbf'::uuid, 'Ignacio Pérez Soria', 'Ignacio', 'Pérez Soria'),
('8e86c3cd-bd87-49f5-a731-ec79b8012e7c'::uuid, 'Benjamín Castro', 'Benjamín', 'Castro'),
('cfdb4e07-3fbb-49b9-9af8-b42768e23e24'::uuid, 'Joaquín Castillo', 'Joaquín', 'Castillo'),
('cbfaa6fe-5991-4029-987a-08ff7d8cf664'::uuid, 'Facundo Rodríguez', 'Facundo', 'Rodríguez'),
('40fa7490-78c3-46da-a1e6-c305af65055f'::uuid, 'Uriel Spósito', 'Uriel', 'Spósito'),
('5ac822aa-7fe2-4a36-82d3-16dc52659991'::uuid, 'Tomás Bergero', 'Tomás', 'Bergero'),
('a0296d84-3c16-41be-81a9-ec81f2d61a1d'::uuid, 'Nicolás Viola', 'Nicolás', 'Viola'),
('8c3c13ed-b933-4a39-8f60-e526af4a896e'::uuid, 'Abraham Elías', 'Abraham', 'Elías'),
('eee08568-846a-4df9-a786-9fca461bee45'::uuid, 'Julián Viola', 'Julián', 'Viola'),
('cad6d344-517e-42f4-8eef-04be3a2c6ca4'::uuid, 'Lautaro Esteban Ramírez Juncos', 'Lautaro Esteban Ramírez', 'Juncos'),
('e283027c-78fc-46d2-af05-62d18150e311'::uuid, 'Fausto Gangemi', 'Fausto', 'Gangemi'),
('3699089c-92d9-4a77-a7d5-c9b5e909430f'::uuid, 'Simón Trejo', 'Simón', 'Trejo'),
('c54b45fe-84f8-4e7b-9a8f-b803c2620172'::uuid, 'Juan Manuel Freytes Echenique', 'Juan Manuel Freytes', 'Echenique'),
('327d84a4-c3eb-4cdc-894c-483c669952aa'::uuid, 'Lucas Busdrago Marinelli', 'Lucas Busdrago', 'Marinelli'),
('a2ec2e41-9149-40e4-b899-bf0fefd2045f'::uuid, 'Lucas Mateo Moyano Aguirre', 'Lucas Mateo', 'Moyano Aguirre'),
('5c512e07-5d01-48d1-95d5-da2b6687bf29'::uuid, 'Martín Vaccarello', 'Martín', 'Vaccarello'),
('136609a4-a46b-4f25-8848-f907c2700597'::uuid, 'Martín López Mirabella', 'Martín López', 'Mirabella'),
('2191bdd1-ea53-4080-b382-61e1a0b90981'::uuid, 'Gonzalo Gargallo Bazan', 'Gonzalo Gargallo', 'Bazan'),
('474780ca-83fe-466e-a89a-babb768015dd'::uuid, 'Matías Soria', 'Matías', 'Soria'),
('78cd72e4-12b5-43c9-90b6-a853ccda2e0c'::uuid, 'Alvaro Solana Allende', 'Alvaro Solana', 'Allende'),
('7745da08-4d31-4595-81e3-069ed9ed5145'::uuid, 'Alejo Manuel Garcia', 'Alejo Manuel', 'Garcia'),
('81b54784-89ff-42a1-9355-af2b6fecf7d7'::uuid, 'Juan Pablo Ruiz', 'Juan Pablo', 'Ruiz'),
('88366104-b077-48da-ae79-e1c2f359cdc4'::uuid, 'Baltazar Monforte Ortiz', 'Baltazar Monforte', 'Ortiz'),
('9f35bb24-b1d5-4484-a19d-fcdc5ae0319e'::uuid, 'Lorenzo Bianco Masso', 'Lorenzo Bianco', 'Masso'),
('ce479bc4-a7ae-48b2-93ad-78c2eef5ed06'::uuid, 'Agustin Altamira Pasqualini', 'Agustin Altamira', 'Pasqualini'),
('a623a664-0c69-44ed-bef2-c6a23c0135f6'::uuid, 'Álvaro Silva', 'Álvaro', 'Silva'),
('38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid, 'Hilario Fernández Frontera', 'Hilario', 'Fernández Frontera'),
('d97cad7e-057d-4b96-9180-2f5a866cc1ca'::uuid, 'Ignacio de Vértiz', 'Ignacio', 'de Vértiz'),
('0aeef5e9-4a48-4b79-894c-5b0928cd718a'::uuid, 'Agustín Córdoba', 'Agustín', 'Córdoba'),
('14f74871-70aa-4a4a-9359-03d1c6799abb'::uuid, 'Juan Cruz Capdevila Soler', 'Juan Cruz Capdevila', 'Soler'),
('ffaba68c-92b9-4b85-8399-58d35322bd05'::uuid, 'Santiago Benjamin Luna', 'Santiago Benjamin', 'Luna'),
('5d56490f-61bd-4b5c-bd8d-869492fd2092'::uuid, 'Álvaro Ortega Domenino', 'Álvaro', 'Ortega Domenino'),
('23eb5b99-2b75-4371-bdb3-a51479fea9cf'::uuid, 'Valentín Cantarutti', 'Valentín', 'Cantarutti'),
('f78459e4-ecb0-4079-86df-4a4e237613ec'::uuid, 'Carlos Quinto Luque Colombres', 'Carlos Quinto Luque', 'Colombres'),
('47a1b64e-ebb7-470a-9623-741a8ced67eb'::uuid, 'Felipe Spagnuolo Garzon', 'Felipe Spagnuolo', 'Garzon'),
('7a083df9-1276-4947-8988-f4e57d0ca1a3'::uuid, 'Juan Cruz Carballo Argañaraz', 'Juan Cruz Carballo', 'Argañaraz'),
('8794c13f-290c-418e-ab59-efec97835d9f'::uuid, 'Valentín Ucar', 'Valentín', 'Ucar'),
('b8e710d4-4aae-4224-b05d-ba4aca8d287e'::uuid, 'Tobías Rojas', 'Tobías', 'Rojas'),
('a0cc29da-cacf-451b-91b2-a2ff31c3ad28'::uuid, 'Benjamín Spagnuolo', 'Benjamín', 'Spagnuolo'),
('12561908-a9d0-44c0-bb72-8fdc80298e76'::uuid, 'Benjamín Vázquez Calcaterra', 'Benjamín', 'Vázquez Calcaterra'),
('22962931-afb2-4964-8802-2e69dff00f72'::uuid, 'Francisco Ivan Acosta Brizuela', 'Francisco Ivan Acosta', 'Brizuela'),
('2aacf595-fa7f-40a9-90b0-bc5fd7eacf3a'::uuid, 'Francisco Cabanillas Martinez', 'Francisco Cabanillas', 'Martinez'),
('e010ed8a-0f2f-40eb-ab76-fda20083b953'::uuid, 'Agustín Ludueña', 'Agustín', 'Ludueña'),
('801e6c67-02fe-43d8-85c0-c3e026e3b910'::uuid, 'Agustín Arias', 'Agustín', 'Arias'),
('c79c7f72-d7a3-4357-9c93-ff602b8b7d35'::uuid, 'Agustín Andreosi', 'Agustín', 'Andreosi'),
('8e5c2da0-5f1c-47aa-8301-ae62a511d8e7'::uuid, 'Agustín Daniel Mana', 'Agustín Daniel', 'Mana'),
('940df5b3-361e-4cb1-bc1c-8bb68bcfdcfc'::uuid, 'Salvador Cabanillas Martinez', 'Salvador Cabanillas', 'Martinez'),
('747ecbae-2432-4d33-86b1-df9eef45e706'::uuid, 'Santiago Ismael Cabello', 'Santiago Ismael', 'Cabello'),
('b1c622cc-f0cc-44ae-923a-95effea60106'::uuid, 'José Maria Lopez Vairoletti', 'José Maria Lopez', 'Vairoletti'),
('c0d5abe9-342c-45e6-b180-ccfa4286ab8a'::uuid, 'Jerónimo Losada', 'Jerónimo', 'Losada');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_h_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_h_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_h_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_h_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_h_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_h_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_h_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_h_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_h_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_h_matches);
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
