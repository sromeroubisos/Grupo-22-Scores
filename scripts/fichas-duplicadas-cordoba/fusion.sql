
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('f382ee28-6f54-47f9-a9b1-6e36d7fc1f77'::uuid, '0448fede-0aeb-436d-a518-158c9bd24289'::uuid),
('92824acf-8c3c-449c-8af8-a8fa34ea8866'::uuid, '401798af-21fe-4b23-a78c-39ee61447b4a'::uuid),
('1a2fdecd-f449-4131-b4a4-249cc6bfde02'::uuid, '8a607565-b331-4956-af19-7d857026f2f4'::uuid),
('2939cfb6-534a-4f55-a4cf-5d80ac956c05'::uuid, '80b45e6c-ee07-42b1-ad82-ee5dff54f2b7'::uuid),
('1c0da995-8e9d-455d-8cf4-abdeb59bd7a6'::uuid, '2e13f462-11da-4e94-8faa-8d674e1e84d2'::uuid),
('36f15f75-dab9-4e45-b05d-0f9d7e9b1d20'::uuid, 'd0d223b0-2b56-499d-b1e2-a72fcf5eb7d5'::uuid),
('8f5fa321-d4f2-4fbb-b002-0216fb163934'::uuid, 'ad279cba-2c07-41f5-a8da-3f50acf51d8b'::uuid),
('e3c771c4-ebac-489f-b643-7cbfc47dc949'::uuid, 'a72eadda-07db-40c6-9bc3-11ca30bcbd8f'::uuid),
('d3d0e307-9739-4b11-9bb7-3453455a2e91'::uuid, 'c801d886-11df-4530-b55e-c37e9bcaee90'::uuid),
('acd66e74-6cb0-49bd-83f0-ddbfa49e3eaa'::uuid, 'bd9a28d7-bfd3-4923-b180-10e5234b9386'::uuid),
('0c234b3a-2ac0-456e-8f72-9531a3a8c01e'::uuid, 'a04d1720-3ff3-4c9c-93fe-f301cff26a78'::uuid),
('e362679f-c193-4e9c-9081-357371d35c9d'::uuid, '2bad3eeb-9cd2-4be7-8c92-de0cd7bb244b'::uuid),
('48029eeb-1779-4e72-bf1d-f760a3926a9a'::uuid, 'aab7ed6c-6828-4073-ab2c-14d15aca7b64'::uuid),
('1a391a6b-840e-4e0d-a375-68612c27783f'::uuid, '64fdf8a4-c2a5-43ab-9009-41f00c2fac3b'::uuid),
('661db2ab-7b8f-4864-9fc0-48d49eec403d'::uuid, 'd13c09cb-ab35-4f5c-887b-bc3f88bdfb24'::uuid),
('e2a39dde-f836-4a94-842e-37eb53b4c90e'::uuid, '04669eed-742e-4942-8dc4-377c2a27da1a'::uuid),
('99e393a6-62df-4123-ae00-f83cb11d39be'::uuid, 'c82aca11-bbc1-45e2-95f6-48b0ea81b5cd'::uuid),
('00f0812b-0035-4fda-87dd-a753cbfa31d5'::uuid, '9ad1cea7-6611-4592-95a4-bd09980d6b90'::uuid),
('b126dce3-5a67-4dae-9bd2-bf47030854bd'::uuid, '068c791a-ffd6-4473-a6f0-fa9ed5c040ff'::uuid),
('9180c7e8-cf54-4340-b324-90ceeb2440e3'::uuid, '0714e931-4acf-4cdf-92f7-0195a8161b66'::uuid),
('17e15781-8828-4a25-812f-d162a6b16273'::uuid, '81c4c21e-5b31-481b-a988-27599e0496c1'::uuid),
('19d74a6e-72ae-4115-a27b-c28a9edfc122'::uuid, '3f262728-4bdc-4000-aeeb-341063605ddb'::uuid),
('66a4db21-7815-4493-b04e-0263b42bbaeb'::uuid, '3f262728-4bdc-4000-aeeb-341063605ddb'::uuid),
('b4b78cf1-1e61-4c15-9169-40cb6e88e1c6'::uuid, '259f78a7-fc1f-42e6-bccd-6e2166467e31'::uuid),
('90aa0453-ec33-422b-8240-4783ed5ae316'::uuid, '2c541a9d-7811-4d8a-929f-4496ffcb71b4'::uuid),
('305fced2-2191-4f23-97d5-99c05bae97cc'::uuid, 'e00fed55-47e6-4c5f-8cb4-d70ae9a9fff6'::uuid),
('3e801cc5-40b3-4285-bd07-5b705660b551'::uuid, 'fbf33373-1683-44b1-8a3f-9db699009e6a'::uuid),
('9af00c61-f0fc-48a0-849d-3e291abc9bfb'::uuid, '417343fb-a127-4360-8af7-493c6601d21b'::uuid),
('66cbce70-b73d-4604-b871-7633c3f132a2'::uuid, '42a8507b-3213-4821-b92d-255acc644448'::uuid),
('438fee4f-074f-48b7-ba7e-9ad92a6f5b6f'::uuid, '7b3481b2-9e6a-41d7-9b13-2f7a7a065f7c'::uuid),
('43d5be5e-567b-495b-a44c-b66176519e65'::uuid, '5d03c0e2-59f8-4506-b50b-af4c0427cd3f'::uuid),
('bfb75a1e-c662-42b5-aefb-83abfc3aff7b'::uuid, '448d3b63-1a18-4dfd-8388-965a3139d529'::uuid),
('47579f10-ba26-48cd-847f-5ec1d673b004'::uuid, 'cfdb4e07-3fbb-49b9-9af8-b42768e23e24'::uuid),
('50098658-85ee-4476-a16b-4c92eb83c096'::uuid, '9623fe7a-f0ca-49fa-9b6f-1e641f7b0028'::uuid),
('574a6f3b-118c-4163-9c54-30645fa41887'::uuid, 'd9e8eb20-619e-4121-9245-3bb36e8b7ae6'::uuid),
('63248970-bde1-4c5b-a067-f8e9e31f7d40'::uuid, '8bc97f7c-609a-4efe-9db0-aecab6727bbf'::uuid),
('d17a5508-03d3-4549-a399-7484412990a7'::uuid, '6a090348-852f-43f2-91b2-c9906da41fd6'::uuid),
('6cb65e45-3ecd-40ee-94a1-42e637bf4c03'::uuid, 'f42d0993-8ec8-4d4f-9d09-12915dd54628'::uuid),
('80794581-834e-4337-9367-541e7cd3d300'::uuid, 'e26aee4c-9740-4204-b99f-4e66b90daddb'::uuid),
('c06d75f6-a6e6-41aa-9fa8-c26cc43be139'::uuid, '8e86c3cd-bd87-49f5-a731-ec79b8012e7c'::uuid),
('a255262a-d777-4f09-81d8-a6faca579f13'::uuid, 'f6dc3c99-7016-414e-aa1f-64e82f79f54c'::uuid),
('b93190ca-4657-4143-8ee5-b00e883dc77d'::uuid, 'fed84ba9-76ee-4509-ab2a-deaa67bc636e'::uuid),
('e336277b-4d5d-4670-a7cb-5c2e654b0478'::uuid, '14232d7b-d15c-42da-9aee-8bb6c151560c'::uuid),
('c9d54d2c-f60b-48e2-9aad-dd1055f1d623'::uuid, '235f3fdc-7cf6-418b-85ff-4681d1ae5053'::uuid),
('48721d70-5fb5-4734-8cdb-b408860f0677'::uuid, 'e4ade8c5-6740-4f7b-83dc-95e9054cb688'::uuid),
('270259ac-d8e9-49ca-b0a7-08d730a3aa03'::uuid, '204ced29-27c0-4020-bce8-7dab7eebd7e9'::uuid),
('74a0c586-62ae-4d26-ab65-7f75d7fd5bed'::uuid, 'a681beba-9344-42c2-8637-877456227724'::uuid),
('174129b9-99fe-4b96-91ca-925f4d7f786e'::uuid, '98bf9fed-1bc2-4062-933d-714a7037b791'::uuid),
('d86071e6-bb8c-435d-bd09-ced682a024df'::uuid, 'd17b3e26-faa8-46c5-b464-8ccdac5c79c6'::uuid),
('6ff48800-d11e-499e-bf80-98bf18336fd8'::uuid, 'bc0143c2-bd63-4b3d-85f8-e1ca2125a0f9'::uuid),
('8c8fc4e6-eedc-48ac-86a4-cde162eba311'::uuid, '56dadc25-fa89-46e9-ba45-0c8def4c43b7'::uuid),
('a7514ab3-8af0-424c-93c7-a160dc68e784'::uuid, 'c07810d0-0a65-4b9e-ac63-851bf89e1964'::uuid),
('f2b0a843-595e-40cb-9090-dc12e2c8aedf'::uuid, 'c702b4df-e958-45ab-8008-502654821316'::uuid),
('52565086-bcda-49e4-8662-232b7acfe6d7'::uuid, '1559293c-af34-4b18-98ee-89c4e4079b65'::uuid),
('67655eb0-85c6-4b48-905d-cd324e42303a'::uuid, '9bbd8cde-2c78-484c-8fd5-29a3a6921047'::uuid),
('2c89aac8-f790-4c64-9e07-6f9914451e09'::uuid, '019d4618-bb76-4e28-82cf-705d8c483748'::uuid),
('64b3e42e-aa70-4234-be3e-4b70854f3258'::uuid, '08908853-ed25-4691-8bc1-4da04c4483d3'::uuid),
('ecd959d1-d9d0-423d-a47b-ade11c63a5e1'::uuid, '08b4f8ec-c721-4849-8d36-a3c6cebc4289'::uuid),
('9e03d91e-cfa3-451b-bdb2-df5be3dd8ae7'::uuid, '1475b0f7-6f50-4829-b27b-eebd92a60b72'::uuid),
('96ce26c6-0dec-43d8-bf21-54d04c95a258'::uuid, '47d5308e-b3f9-4c45-af49-34791911b512'::uuid),
('d45ed4ef-d98d-48bc-9aea-212856e49232'::uuid, '4429db7e-1d52-48e2-a717-27c0fd4190e9'::uuid),
('cdbf6ea2-d25a-46d8-bb5d-b8f6324a63fc'::uuid, '4da9d500-b051-4966-8ffb-58e196176001'::uuid),
('82d18268-3cea-408d-a4af-615248bfe39d'::uuid, '81ea97ea-ef36-4d40-b421-b968e4ed5647'::uuid),
('2bf27819-c561-465b-ac83-5ddcfbe29f52'::uuid, '9f7979f1-b288-45e4-b5b6-437f0cf03396'::uuid),
('b4ba7f9b-aa49-402f-91a6-dcf3e18fbc74'::uuid, '711fb137-1226-4396-b51b-4c63e1453488'::uuid),
('2353cc52-bf76-4582-ba0a-357dab4af539'::uuid, 'bd6f950b-ecce-4f55-9232-21fcc033b621'::uuid),
('45c0ad16-9b7c-4f45-a16b-7b55143ff361'::uuid, 'bf35e16f-6117-4d2e-bd1d-518381c0ef74'::uuid),
('26fbe027-c8c2-4a1f-8645-2a5ea6db264d'::uuid, 'd4f5f7a7-0e16-4985-bb2a-73b1bb743843'::uuid),
('40bc44ef-f0fb-49ac-bc6f-f0eb3256ee4b'::uuid, '4e15e30f-7974-458f-bfc8-04e4c78477f5'::uuid),
('ba838b76-036b-411c-956a-711885a0e3f8'::uuid, 'c283dc6a-2dac-4381-977b-c2bb66c8f6cd'::uuid),
('d1b14a9c-faf2-4786-8ade-604ea3e4093c'::uuid, '57af4490-1c88-4679-86e2-49217eee2184'::uuid),
('08ebe944-64d7-42e2-9c68-87820f4237f7'::uuid, 'db876971-ffce-4a60-8c17-ac0189186cee'::uuid),
('5d7a54b5-3a90-4cb9-a28e-38a0a6bb679f'::uuid, '16678fb8-afc9-41d4-86e4-3264d6b53444'::uuid),
('2cf185d6-318b-4393-b3ad-a607014b7635'::uuid, '88348a94-9cfc-43cb-8ed7-506e44e21c85'::uuid),
('b6d6b2f7-5342-44bb-a970-4aaef1d3999e'::uuid, '7305bc17-ba48-4295-ac8b-ac2425096bdc'::uuid),
('c36acb8a-0dc0-4223-86e8-35a513c45423'::uuid, 'a20757d4-9ef1-4882-85a9-e6a0398d7113'::uuid),
('057dcbb6-5ea9-4efb-a797-4dd36df85632'::uuid, '40fa7490-78c3-46da-a1e6-c305af65055f'::uuid),
('42dcc581-a353-4417-af01-1b1855970b1a'::uuid, 'cad6d344-517e-42f4-8eef-04be3a2c6ca4'::uuid),
('5af3bf84-83e9-438e-8ccd-fc23cae33177'::uuid, '5ac822aa-7fe2-4a36-82d3-16dc52659991'::uuid),
('9f1cf48c-85f9-4711-9c9b-d92545df7622'::uuid, 'cbfaa6fe-5991-4029-987a-08ff7d8cf664'::uuid),
('4893e314-1e8c-4c56-92f8-033797c19dbd'::uuid, 'f3cce64b-0591-4fb9-9080-34b912e5975f'::uuid),
('427f29f9-1a56-4bcf-bdb2-a10c687bf975'::uuid, 'b46268ae-7032-4ccb-ba2b-12d90390e0e0'::uuid),
('48a0465c-aac3-4d5c-8155-4c0ced46a61f'::uuid, '49f8c92f-5506-4dd6-9d86-4b90727be297'::uuid),
('bc63522a-c026-4bdc-9406-54c2557ed1ec'::uuid, '022c1107-1248-4d51-9105-65d50fd2138a'::uuid),
('89f596f1-7f69-4f7e-9059-e80bd2480d9b'::uuid, '0c723a09-ec3f-4603-b4cf-b477ce41c78d'::uuid),
('20c8fba7-f8fb-45ab-9699-fafbe35ed55a'::uuid, '0da56420-b514-4d44-a3f8-28f14742e827'::uuid),
('3ca11d95-c455-41d6-beed-d83672f7139b'::uuid, '3620d519-a141-4f40-aeaa-8124f2767f2d'::uuid),
('be78320c-d171-4cb7-a6a4-07b6636405a7'::uuid, '38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid),
('df514992-9040-4413-8c71-65a58fe6b3ba'::uuid, '38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid),
('4ec17002-8db2-401b-ab65-d6a14619ebf9'::uuid, 'bef2d38e-44c2-43c2-9f54-beab15bdf181'::uuid),
('605ef257-607a-4133-a870-8643dd56f267'::uuid, 'c23e8e52-f9ec-483d-aa5b-83e0db376d0d'::uuid),
('7e149c60-0586-4b7d-bce9-f003dfe86007'::uuid, 'c23e8e52-f9ec-483d-aa5b-83e0db376d0d'::uuid),
('91e90246-8ae1-4b67-bd99-7b0c82b3749b'::uuid, '806a9dc3-82b4-4600-9c01-ca39eca4d529'::uuid),
('b03e4192-559d-45fe-85d0-06ba40047900'::uuid, 'c946dfe7-4538-4084-acd6-798ed61fc1ce'::uuid),
('a5862e33-57c0-403e-ac10-fa3bb932774e'::uuid, '072f3cd5-6548-4399-a061-ac533b10a425'::uuid),
('532aab0e-fbe8-42db-8f00-08e80392170c'::uuid, '0f27bba7-ff69-4213-8fa4-f02f75db41d4'::uuid),
('b0442be9-1e65-4f5f-8481-25e04b57fa30'::uuid, '0f27bba7-ff69-4213-8fa4-f02f75db41d4'::uuid),
('804b022c-1468-44d7-ac5b-a50da3cd58e2'::uuid, '2faec52a-079c-4895-a91f-cafb98d1dda4'::uuid),
('01b408c7-7e4f-4afc-8e4a-5d1eed45c4aa'::uuid, '2c8e1d28-f34e-4d32-a6dd-e24c67f37520'::uuid),
('f56ade99-4361-4e61-a73d-991444bea2df'::uuid, '3791551d-5cd4-488f-a189-ad03e896935a'::uuid),
('e14c4a76-1d9d-4f0c-a960-1208e775365d'::uuid, '4e899128-0865-465e-ab96-6db572e9d9b2'::uuid),
('332d3132-1119-43d6-b421-0b4247a04cec'::uuid, '7846a8de-564f-460f-ab88-b27cbd03b212'::uuid),
('a2ff172d-eadd-4441-859c-4cb178822f38'::uuid, '8131190b-ae0e-4d95-81ef-4fb3ef9cf9a3'::uuid),
('342d0fee-79e9-4fac-9235-2ca9c7fc6c13'::uuid, '870a5f99-0f79-4906-9af7-d8432f89257a'::uuid),
('f1f8ac66-5ed0-4a6d-93bd-f6fd2263ad72'::uuid, '950f40e4-ba1c-432b-9921-6f49192b06b3'::uuid),
('b04cfdf0-2dd1-4ca1-8334-603a383a18c4'::uuid, 'a26b67f6-e779-463e-8ece-ac661aad4e4f'::uuid),
('57e7d1d8-617d-43d5-952b-b9329b6d57a8'::uuid, 'b257bc32-78d5-4b1e-a48a-fd6b7c995676'::uuid),
('ae8a37c5-4d8a-4ad5-a20e-97395b908122'::uuid, 'c99b9f99-6471-47c5-9f51-b8b21657639c'::uuid),
('2dcb5afd-f3af-4843-9eb8-af328216c5b0'::uuid, 'd286fad2-5f3a-45aa-88d8-72fe956b00e0'::uuid),
('a15f76b7-4aae-470f-93e6-fc7e6e28145a'::uuid, 'd66f2f15-c3c6-4944-8a22-2b7135d0468f'::uuid),
('6a7a82da-517b-46aa-b7bf-2c9107b0a166'::uuid, 'd97cad7e-057d-4b96-9180-2f5a866cc1ca'::uuid),
('9812dd6e-fc3f-420b-a759-f02748eecf39'::uuid, 'd97cad7e-057d-4b96-9180-2f5a866cc1ca'::uuid),
('6fea8783-1df8-4ae2-bbac-befa32ce04f5'::uuid, 'f0d5fee7-1108-438e-b42f-edb7e3f901b4'::uuid),
('4d9035ff-b46a-42e1-8c9a-eb7affe1e278'::uuid, 'd800ca89-f5a5-46fd-828e-5e0bcfed9bd7'::uuid),
('eabf6d36-d317-46d9-abba-ebf0489d0bbb'::uuid, 'd81a29d2-0005-47c0-99a3-4cb6eeeaafb4'::uuid),
('0891cb7a-7ff0-4157-b2fa-1c8376782df6'::uuid, '086ffdc8-6850-43db-bccc-54d4e0cd5ff6'::uuid),
('5d440848-c32a-4900-9255-5024ef34848e'::uuid, '148f4664-16a8-402c-bb38-0798659c556c'::uuid),
('176118b4-1abb-482b-ba86-eaa6d1bba143'::uuid, '875ca712-e43f-475b-83aa-53e75980cccc'::uuid),
('249c753c-4d24-4ae4-ae6b-267c4fd1cfcc'::uuid, 'b6bcfe02-053e-45bb-835b-ab96231ed2c9'::uuid),
('25a37240-b4ea-4d72-b960-7e3c1a034f3c'::uuid, 'f8e605df-0bc5-4836-9b2c-bd41e3eb92b6'::uuid),
('3bb66a11-40dd-4da5-850d-a427781daa37'::uuid, '900af005-0206-4c1b-a9f1-33394d959ccc'::uuid),
('e9745ae4-7e78-415d-a15f-b75b0711a4ab'::uuid, '6a3a7a2c-d647-4cc6-8f60-cc1b11642736'::uuid),
('f649614e-ae97-4696-bfee-48d29f8898f8'::uuid, '799d852a-50e6-4cee-b8e2-adb329a5a4dd'::uuid),
('a31dfcbd-bd7c-444a-8499-9b35f5e47e8b'::uuid, '86e0d81e-0a6e-4ed8-9f15-76d5de2a7009'::uuid),
('8fb578f7-8f2b-4e1b-a72e-471b2b6d3c6b'::uuid, 'de780b71-ebaa-4ca5-9951-305f2e2789d8'::uuid),
('dc7db86f-a3a2-4df7-8446-1f37f47fc9af'::uuid, 'a21048f0-83bf-4054-9ca2-9b4ed369d626'::uuid),
('e3015e49-35ae-4e51-bdd3-3fe888df2009'::uuid, '109f6edc-87da-47c6-9397-3ecb2f5e33f3'::uuid),
('3662f5e7-b073-4dbb-a78b-4237927b740d'::uuid, '61faeb9d-cf9c-4258-b8b5-7fb436355e32'::uuid),
('87900aa2-1086-4f9a-82a0-d9c09208330d'::uuid, '57edaf66-12c4-4dc3-a1bc-5b044a147af1'::uuid),
('de6e4bb6-8181-4e3a-a957-075e7ad58ef5'::uuid, '598e1706-4f2b-42ca-85c8-a3dcf357d205'::uuid),
('e96f08ff-2fff-472a-ac5d-5d8c1f0931dd'::uuid, 'a983766d-db93-4b63-85d3-cbe84c33c521'::uuid),
('9ec7ea0f-5893-4e6c-96c1-6a1f5d1064fc'::uuid, '906e83b2-331b-4106-86a2-9d1b474181d0'::uuid),
('238e9b7d-c5b8-498f-a6f8-547d89a8e60f'::uuid, '338552e8-abaf-4681-8c45-9a591dc36e51'::uuid),
('5caeb6d0-7606-4634-b24c-699f926cd82c'::uuid, 'ec5379c1-5cd9-4eee-8a2a-e77a3df00dd6'::uuid),
('b0d5245d-69af-4bfa-b24c-2912eb8348c9'::uuid, '7d626d0c-7607-4e84-b648-381b50b1cf9a'::uuid),
('e0b46458-b61f-467f-b508-a7f7d8f61c17'::uuid, 'd0d3cf35-8582-496b-83ae-ad251e74f427'::uuid),
('dd9a7907-4fc0-43ff-b198-91ac946d3aa7'::uuid, 'fb66d4f8-ffb3-4d94-bdda-5717a57b06de'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('0448fede-0aeb-436d-a518-158c9bd24289'::uuid, 'Matias Benjamin Herrera', 'Matias Benjamin', 'Herrera'),
('401798af-21fe-4b23-a78c-39ee61447b4a'::uuid, 'Alexis Agustin Maldonado', 'Alexis Agustin', 'Maldonado'),
('8a607565-b331-4956-af19-7d857026f2f4'::uuid, 'Joaquin Villegas', 'Joaquin', 'Villegas'),
('80b45e6c-ee07-42b1-ad82-ee5dff54f2b7'::uuid, 'Agustin Homero Cañas', 'Agustin Homero', 'Cañas'),
('2e13f462-11da-4e94-8faa-8d674e1e84d2'::uuid, 'Dario Sanchez', 'Dario', 'Sanchez'),
('d0d223b0-2b56-499d-b1e2-a72fcf5eb7d5'::uuid, 'Elías Fabricio Cuello Villarreal', 'Elías Fabricio Cuello', 'Villarreal'),
('ad279cba-2c07-41f5-a8da-3f50acf51d8b'::uuid, 'Martin Flores', 'Martin', 'Flores'),
('a72eadda-07db-40c6-9bc3-11ca30bcbd8f'::uuid, 'Jesús Emanuel Cena', 'Jesús Emanuel', 'Cena'),
('c801d886-11df-4530-b55e-c37e9bcaee90'::uuid, 'Nicolas Homero Alisio', 'Nicolas Homero', 'Alisio'),
('bd9a28d7-bfd3-4923-b180-10e5234b9386'::uuid, 'Brian Nahuel Sebastian Farini', 'Brian Nahuel Sebastian', 'Farini'),
('a04d1720-3ff3-4c9c-93fe-f301cff26a78'::uuid, 'Nicolás Facchini', 'Nicolás', 'Facchini'),
('2bad3eeb-9cd2-4be7-8c92-de0cd7bb244b'::uuid, 'Nicolas Gaston Garafulic', 'Nicolas Gaston', 'Garafulic'),
('aab7ed6c-6828-4073-ab2c-14d15aca7b64'::uuid, 'Matias Mariano Gomez', 'Matias Mariano', 'Gomez'),
('64fdf8a4-c2a5-43ab-9009-41f00c2fac3b'::uuid, 'Joaquin Ismael Morosan Bunzli', 'Joaquin Ismael Morosan', 'Bunzli'),
('d13c09cb-ab35-4f5c-887b-bc3f88bdfb24'::uuid, 'Juan Manuel Aragon', 'Juan Manuel', 'Aragon'),
('04669eed-742e-4942-8dc4-377c2a27da1a'::uuid, 'Santiago Ezequiel Galvan', 'Santiago Ezequiel', 'Galvan'),
('c82aca11-bbc1-45e2-95f6-48b0ea81b5cd'::uuid, 'Nicolás Ezequiel Castelari', 'Nicolás Ezequiel', 'Castelari'),
('9ad1cea7-6611-4592-95a4-bd09980d6b90'::uuid, 'Galo Fernández', 'Galo', 'Fernández'),
('068c791a-ffd6-4473-a6f0-fa9ed5c040ff'::uuid, 'Joaquín Ameijeiras', 'Joaquín', 'Ameijeiras'),
('0714e931-4acf-4cdf-92f7-0195a8161b66'::uuid, 'Francisco Aldonza', 'Francisco', 'Aldonza'),
('81c4c21e-5b31-481b-a988-27599e0496c1'::uuid, 'Santiago Ramírez', 'Santiago', 'Ramírez'),
('3f262728-4bdc-4000-aeeb-341063605ddb'::uuid, 'Conrado Iglesias Quintana', 'Conrado', 'Iglesias Quintana'),
('259f78a7-fc1f-42e6-bccd-6e2166467e31'::uuid, 'Luciano Lampasona', 'Luciano', 'Lampasona'),
('2c541a9d-7811-4d8a-929f-4496ffcb71b4'::uuid, 'Juan Cruz Menendez', 'Juan Cruz', 'Menendez'),
('e00fed55-47e6-4c5f-8cb4-d70ae9a9fff6'::uuid, 'Jerónimo Aramayo', 'Jerónimo', 'Aramayo'),
('fbf33373-1683-44b1-8a3f-9db699009e6a'::uuid, 'Emir Agustín Karqui', 'Emir Agustín', 'Karqui'),
('417343fb-a127-4360-8af7-493c6601d21b'::uuid, 'Juan Altamirano', 'Juan', 'Altamirano'),
('42a8507b-3213-4821-b92d-255acc644448'::uuid, 'Tomás Salva', 'Tomás', 'Salva'),
('7b3481b2-9e6a-41d7-9b13-2f7a7a065f7c'::uuid, 'Valentín D''angelo', 'Valentín', 'D''angelo'),
('5d03c0e2-59f8-4506-b50b-af4c0427cd3f'::uuid, 'Tomás Díaz', 'Tomás', 'Díaz'),
('448d3b63-1a18-4dfd-8388-965a3139d529'::uuid, 'Agustín Novillo', 'Agustín', 'Novillo'),
('cfdb4e07-3fbb-49b9-9af8-b42768e23e24'::uuid, 'Joaquín Castillo', 'Joaquín', 'Castillo'),
('9623fe7a-f0ca-49fa-9b6f-1e641f7b0028'::uuid, 'Francisco Aguirre Gallardo', 'Francisco', 'Aguirre Gallardo'),
('d9e8eb20-619e-4121-9245-3bb36e8b7ae6'::uuid, 'Ramiro Iglesias Quintana', 'Ramiro Iglesias', 'Quintana'),
('8bc97f7c-609a-4efe-9db0-aecab6727bbf'::uuid, 'Ignacio Pérez Soria', 'Ignacio', 'Pérez Soria'),
('6a090348-852f-43f2-91b2-c9906da41fd6'::uuid, 'Sabino Moras Caula', 'Sabino', 'Moras Caula'),
('f42d0993-8ec8-4d4f-9d09-12915dd54628'::uuid, 'Lorenzo Aramayo', 'Lorenzo', 'Aramayo'),
('e26aee4c-9740-4204-b99f-4e66b90daddb'::uuid, 'Lucas Villalba Rustichelli', 'Lucas', 'Villalba Rustichelli'),
('8e86c3cd-bd87-49f5-a731-ec79b8012e7c'::uuid, 'Benjamín Castro', 'Benjamín', 'Castro'),
('f6dc3c99-7016-414e-aa1f-64e82f79f54c'::uuid, 'Facundo Agustín Vergara', 'Facundo Agustín', 'Vergara'),
('fed84ba9-76ee-4509-ab2a-deaa67bc636e'::uuid, 'José Ignacio Castro', 'José Ignacio', 'Castro'),
('14232d7b-d15c-42da-9aee-8bb6c151560c'::uuid, 'Ignacio Gabriel Farías Decarlini', 'Ignacio Gabriel Farías', 'Decarlini'),
('235f3fdc-7cf6-418b-85ff-4681d1ae5053'::uuid, 'Horacio De La Mota Boehler', 'Horacio De La Mota', 'Boehler'),
('e4ade8c5-6740-4f7b-83dc-95e9054cb688'::uuid, 'Ignacio Raul Abrile', 'Ignacio Raul', 'Abrile'),
('204ced29-27c0-4020-bce8-7dab7eebd7e9'::uuid, 'Juan Manuel de Dios Gigena Gutierrez', 'Juan Manuel de Dios Gigena', 'Gutierrez'),
('a681beba-9344-42c2-8637-877456227724'::uuid, 'Gonzalo Losada', 'Gonzalo', 'Losada'),
('98bf9fed-1bc2-4062-933d-714a7037b791'::uuid, 'Juan Ignacio Guerrieri', 'Juan Ignacio', 'Guerrieri'),
('d17b3e26-faa8-46c5-b464-8ccdac5c79c6'::uuid, 'Victorio Guerrieri', 'Victorio', 'Guerrieri'),
('bc0143c2-bd63-4b3d-85f8-e1ca2125a0f9'::uuid, 'Joaquín Alejand Castillo Ceballos', 'Joaquín Alejand Castillo', 'Ceballos'),
('56dadc25-fa89-46e9-ba45-0c8def4c43b7'::uuid, 'Lautaro Nahuel Orazi', 'Lautaro Nahuel', 'Orazi'),
('c07810d0-0a65-4b9e-ac63-851bf89e1964'::uuid, 'Lucas Bur', 'Lucas', 'Bur'),
('c702b4df-e958-45ab-8008-502654821316'::uuid, 'Juan Cruz Calamita', 'Juan Cruz', 'Calamita'),
('1559293c-af34-4b18-98ee-89c4e4079b65'::uuid, 'Lorenzo Bianco Masso', 'Lorenzo Bianco', 'Masso'),
('9bbd8cde-2c78-484c-8fd5-29a3a6921047'::uuid, 'Nicolás Hitt Reyes', 'Nicolás Hitt', 'Reyes'),
('019d4618-bb76-4e28-82cf-705d8c483748'::uuid, 'Facundo Gustavo Alemanno', 'Facundo Gustavo', 'Alemanno'),
('08908853-ed25-4691-8bc1-4da04c4483d3'::uuid, 'Fausto Echeverria', 'Fausto', 'Echeverria'),
('08b4f8ec-c721-4849-8d36-a3c6cebc4289'::uuid, 'Nicolás Revol Pitt', 'Nicolás Revol', 'Pitt'),
('1475b0f7-6f50-4829-b27b-eebd92a60b72'::uuid, 'Martín Tobal', 'Martín', 'Tobal'),
('47d5308e-b3f9-4c45-af49-34791911b512'::uuid, 'Auca Nahuel Pucheta', 'Auca Nahuel', 'Pucheta'),
('4429db7e-1d52-48e2-a717-27c0fd4190e9'::uuid, 'Alfredo Pueyrredón', 'Alfredo', 'Pueyrredón'),
('4da9d500-b051-4966-8ffb-58e196176001'::uuid, 'Baltazar Monforte Ortiz', 'Baltazar Monforte', 'Ortiz'),
('81ea97ea-ef36-4d40-b421-b968e4ed5647'::uuid, 'Juan Cruz Corral', 'Juan Cruz', 'Corral'),
('9f7979f1-b288-45e4-b5b6-437f0cf03396'::uuid, 'Nicolás Olguín', 'Nicolás', 'Olguín'),
('711fb137-1226-4396-b51b-4c63e1453488'::uuid, 'Gabriel Alejandro Roldán', 'Gabriel Alejandro', 'Roldán'),
('bd6f950b-ecce-4f55-9232-21fcc033b621'::uuid, 'Agustín Basly', 'Agustín', 'Basly'),
('bf35e16f-6117-4d2e-bd1d-518381c0ef74'::uuid, 'Agustin Vucovich', 'Agustin', 'Vucovich'),
('d4f5f7a7-0e16-4985-bb2a-73b1bb743843'::uuid, 'Bautista Echeverria', 'Bautista', 'Echeverria'),
('4e15e30f-7974-458f-bfc8-04e4c78477f5'::uuid, 'Federico Gutiérrez', 'Federico', 'Gutiérrez'),
('c283dc6a-2dac-4381-977b-c2bb66c8f6cd'::uuid, 'Estanislao Gómez', 'Estanislao', 'Gómez'),
('57af4490-1c88-4679-86e2-49217eee2184'::uuid, 'Manuel Capriglioni', 'Manuel', 'Capriglioni'),
('db876971-ffce-4a60-8c17-ac0189186cee'::uuid, 'Juan Manuel Freytes Echenique', 'Juan Manuel Freytes', 'Echenique'),
('16678fb8-afc9-41d4-86e4-3264d6b53444'::uuid, 'Agustín Segura', 'Agustín', 'Segura'),
('88348a94-9cfc-43cb-8ed7-506e44e21c85'::uuid, 'Genaro Merola Moreschi', 'Genaro Merola', 'Moreschi'),
('7305bc17-ba48-4295-ac8b-ac2425096bdc'::uuid, 'Juan Ignacio Ludueña Fassi', 'Juan Ignacio Ludueña', 'Fassi'),
('a20757d4-9ef1-4882-85a9-e6a0398d7113'::uuid, 'Lucas Mateo Moyano Aguirre', 'Lucas Mateo Moyano', 'Aguirre'),
('40fa7490-78c3-46da-a1e6-c305af65055f'::uuid, 'Uriel Spósito', 'Uriel', 'Spósito'),
('cad6d344-517e-42f4-8eef-04be3a2c6ca4'::uuid, 'Lautaro Esteban Ramírez Juncos', 'Lautaro Esteban Ramírez', 'Juncos'),
('5ac822aa-7fe2-4a36-82d3-16dc52659991'::uuid, 'Tomás Bergero', 'Tomás', 'Bergero'),
('cbfaa6fe-5991-4029-987a-08ff7d8cf664'::uuid, 'Facundo Rodríguez', 'Facundo', 'Rodríguez'),
('f3cce64b-0591-4fb9-9080-34b912e5975f'::uuid, 'Franco Dall’Ava', 'Franco', 'Dall’Ava'),
('b46268ae-7032-4ccb-ba2b-12d90390e0e0'::uuid, 'Ignacio Dogliani', 'Ignacio', 'Dogliani'),
('49f8c92f-5506-4dd6-9d86-4b90727be297'::uuid, 'Juan Bautista Baronio', 'Juan Bautista', 'Baronio'),
('022c1107-1248-4d51-9105-65d50fd2138a'::uuid, 'Felipe Onnis', 'Felipe', 'Onnis'),
('0c723a09-ec3f-4603-b4cf-b477ce41c78d'::uuid, 'Gregorio Hernández Cardinali', 'Gregorio', 'Hernández Cardinali'),
('0da56420-b514-4d44-a3f8-28f14742e827'::uuid, 'Juan Ignacio Pérez Jaime', 'Juan Ignacio Pérez', 'Jaime'),
('3620d519-a141-4f40-aeaa-8124f2767f2d'::uuid, 'Ignacio Díaz Centeno', 'Ignacio', 'Díaz Centeno'),
('38bacd16-3265-4d6d-b5a1-6a707e85a522'::uuid, 'Hilario Fernández Frontera', 'Hilario', 'Fernández Frontera'),
('bef2d38e-44c2-43c2-9f54-beab15bdf181'::uuid, 'Tomás Acevedo Ferreyra', 'Tomás', 'Acevedo Ferreyra'),
('c23e8e52-f9ec-483d-aa5b-83e0db376d0d'::uuid, 'Luciano Agustin Avaca', 'Luciano Agustin', 'Avaca'),
('806a9dc3-82b4-4600-9c01-ca39eca4d529'::uuid, 'Ramiro Agustín Farías Vivas', 'Ramiro Agustín Farías', 'Vivas'),
('c946dfe7-4538-4084-acd6-798ed61fc1ce'::uuid, 'Facundo Nicolás Ortiz', 'Facundo Nicolás', 'Ortiz'),
('072f3cd5-6548-4399-a061-ac533b10a425'::uuid, 'Manuel Arroyo', 'Manuel', 'Arroyo'),
('0f27bba7-ff69-4213-8fa4-f02f75db41d4'::uuid, 'Gerónimo Vittar', 'Gerónimo', 'Vittar'),
('2faec52a-079c-4895-a91f-cafb98d1dda4'::uuid, 'Valentín Soler Filloy', 'Valentín', 'Soler Filloy'),
('2c8e1d28-f34e-4d32-a6dd-e24c67f37520'::uuid, 'Fausto Ferrero', 'Fausto', 'Ferrero'),
('3791551d-5cd4-488f-a189-ad03e896935a'::uuid, 'Manuel Giannantonio', 'Manuel', 'Giannantonio'),
('4e899128-0865-465e-ab96-6db572e9d9b2'::uuid, 'Pedro Cajal', 'Pedro', 'Cajal'),
('7846a8de-564f-460f-ab88-b27cbd03b212'::uuid, 'Lautaro Szkuhra', 'Lautaro', 'Szkuhra'),
('8131190b-ae0e-4d95-81ef-4fb3ef9cf9a3'::uuid, 'Mauricio Kember', 'Mauricio', 'Kember'),
('870a5f99-0f79-4906-9af7-d8432f89257a'::uuid, 'Mateo Cajal', 'Mateo', 'Cajal'),
('950f40e4-ba1c-432b-9921-6f49192b06b3'::uuid, 'Julián Escanilla', 'Julián', 'Escanilla'),
('a26b67f6-e779-463e-8ece-ac661aad4e4f'::uuid, 'Farid Salazar', 'Farid', 'Salazar'),
('b257bc32-78d5-4b1e-a48a-fd6b7c995676'::uuid, 'Lucas Bredanini', 'Lucas', 'Bredanini'),
('c99b9f99-6471-47c5-9f51-b8b21657639c'::uuid, 'Francisco Caturelli', 'Francisco', 'Caturelli'),
('d286fad2-5f3a-45aa-88d8-72fe956b00e0'::uuid, 'Salvador Ortiz', 'Salvador', 'Ortiz'),
('d66f2f15-c3c6-4944-8a22-2b7135d0468f'::uuid, 'Ignacio Giaimo', 'Ignacio', 'Giaimo'),
('d97cad7e-057d-4b96-9180-2f5a866cc1ca'::uuid, 'Ignacio de Vértiz', 'Ignacio', 'de Vértiz'),
('f0d5fee7-1108-438e-b42f-edb7e3f901b4'::uuid, 'Gastón Ignacio San', 'Gastón Ignacio', 'San'),
('d800ca89-f5a5-46fd-828e-5e0bcfed9bd7'::uuid, 'Juan Agustin Vicens', 'Juan Agustin', 'Vicens'),
('d81a29d2-0005-47c0-99a3-4cb6eeeaafb4'::uuid, 'Julian Octavio Bortoli', 'Julian Octavio', 'Bortoli'),
('086ffdc8-6850-43db-bccc-54d4e0cd5ff6'::uuid, 'Mateo Sanchez Mauro', 'Mateo Sanchez', 'Mauro'),
('148f4664-16a8-402c-bb38-0798659c556c'::uuid, 'Estanislao Arrias', 'Estanislao', 'Arrias'),
('875ca712-e43f-475b-83aa-53e75980cccc'::uuid, 'Federico Rodríguez Cirer', 'Federico Rodríguez', 'Cirer'),
('b6bcfe02-053e-45bb-835b-ab96231ed2c9'::uuid, 'Facundo Lopez Lopez', 'Facundo Lopez', 'Lopez'),
('f8e605df-0bc5-4836-9b2c-bd41e3eb92b6'::uuid, 'Juan Segundo Villa', 'Juan Segundo', 'Villa'),
('900af005-0206-4c1b-a9f1-33394d959ccc'::uuid, 'Felipe Acuña', 'Felipe', 'Acuña'),
('6a3a7a2c-d647-4cc6-8f60-cc1b11642736'::uuid, 'Constantino Keller', 'Constantino', 'Keller'),
('799d852a-50e6-4cee-b8e2-adb329a5a4dd'::uuid, 'Genaro Keller', 'Genaro', 'Keller'),
('86e0d81e-0a6e-4ed8-9f15-76d5de2a7009'::uuid, 'Agustín Brasca', 'Agustín', 'Brasca'),
('de780b71-ebaa-4ca5-9951-305f2e2789d8'::uuid, 'Tomás Agustín Fitte', 'Tomás Agustín', 'Fitte'),
('a21048f0-83bf-4054-9ca2-9b4ed369d626'::uuid, 'Luciano Keller', 'Luciano', 'Keller'),
('109f6edc-87da-47c6-9397-3ecb2f5e33f3'::uuid, 'Rogelio Quiroga', 'Rogelio', 'Quiroga'),
('61faeb9d-cf9c-4258-b8b5-7fb436355e32'::uuid, 'Simon Iglesias', 'Simon', 'Iglesias'),
('57edaf66-12c4-4dc3-a1bc-5b044a147af1'::uuid, 'Ignacio Sebastian Biscay', 'Ignacio Sebastian', 'Biscay'),
('598e1706-4f2b-42ca-85c8-a3dcf357d205'::uuid, 'Máximo Iuliano', 'Máximo', 'Iuliano'),
('a983766d-db93-4b63-85d3-cbe84c33c521'::uuid, 'Nicolás Terán Terán Frías', 'Nicolás Terán Terán', 'Frías'),
('906e83b2-331b-4106-86a2-9d1b474181d0'::uuid, 'Ricardo Gauna Martin', 'Ricardo Gauna', 'Martin'),
('338552e8-abaf-4681-8c45-9a591dc36e51'::uuid, 'Julian Ernesto Riva', 'Julian Ernesto', 'Riva'),
('ec5379c1-5cd9-4eee-8a2a-e77a3df00dd6'::uuid, 'Valentin Santino Garay', 'Valentin Santino', 'Garay'),
('7d626d0c-7607-4e84-b648-381b50b1cf9a'::uuid, 'Matias Cejas', 'Matias', 'Cejas'),
('d0d3cf35-8582-496b-83ae-ad251e74f427'::uuid, 'Roman Andrés Pérez Cervetto', 'Roman Andrés Pérez', 'Cervetto'),
('fb66d4f8-ffb3-4d94-bdda-5717a57b06de'::uuid, 'Juan Manuel Lescano', 'Juan Manuel', 'Lescano');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_matches);
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
