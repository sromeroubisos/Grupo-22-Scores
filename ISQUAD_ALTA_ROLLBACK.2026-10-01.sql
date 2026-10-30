-- Rollback del alta de iSquad (FER 2026/27).
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos y
-- los alias los referencian por FK.
BEGIN;

-- Liga Iberdrola de Rugby
DELETE FROM public.tournament_standings WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.matches WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.team_season_entries WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.tournament_participants WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca');
DELETE FROM public.tournament_phases WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.tournament_seasons WHERE tournament_id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';
DELETE FROM public.tournaments WHERE id = '0fa0dcd0-f804-4d95-ba11-c8ce3effd8ca';

-- División de Honor Élite
DELETE FROM public.tournament_standings WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.matches WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.team_season_entries WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.tournament_participants WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077');
DELETE FROM public.tournament_phases WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.tournament_seasons WHERE tournament_id = '01f70bf9-be49-4bd9-a189-227104db5077';
DELETE FROM public.tournaments WHERE id = '01f70bf9-be49-4bd9-a189-227104db5077';

-- División de Honor B Femenina
DELETE FROM public.tournament_standings WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.matches WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.team_season_entries WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.tournament_participants WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad');
DELETE FROM public.tournament_phases WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.tournament_seasons WHERE tournament_id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';
DELETE FROM public.tournaments WHERE id = '2c91670c-ad04-4f91-89d4-79ae76ab96ad';

-- División de Honor B
DELETE FROM public.tournament_standings WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.matches WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.team_season_entries WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.tournament_participants WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97');
DELETE FROM public.tournament_phases WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.tournament_seasons WHERE tournament_id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';
DELETE FROM public.tournaments WHERE id = '5314c1d9-a2da-4027-91a2-9ded970b4a97';

-- Competición Nacional M23
DELETE FROM public.tournament_standings WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.matches WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.team_season_entries WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.tournament_participants WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14');
DELETE FROM public.tournament_phases WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.tournament_seasons WHERE tournament_id = '95364e47-9a87-409d-b303-0677e6d40a14';
DELETE FROM public.tournaments WHERE id = '95364e47-9a87-409d-b303-0677e6d40a14';

-- Alias de equipos creados por esta corrida
DELETE FROM public.club_external_ids WHERE provider = 'isquad' AND external_id IN ('equipo:200', 'equipo:202', 'equipo:209', 'equipo:212', 'equipo:215', 'equipo:216', 'equipo:226', 'equipo:232', 'equipo:247', 'equipo:252', 'equipo:254', 'equipo:255', 'equipo:256', 'equipo:257', 'equipo:261', 'equipo:264', 'equipo:267', 'equipo:269', 'equipo:272', 'equipo:275', 'equipo:276', 'equipo:278', 'equipo:284', 'equipo:285', 'equipo:287', 'equipo:336', 'equipo:341', 'equipo:342', 'equipo:345', 'equipo:1100', 'equipo:1406', 'equipo:1411', 'equipo:1414', 'equipo:1416', 'equipo:1417', 'equipo:1425', 'equipo:1429', 'equipo:1709', 'equipo:1713', 'equipo:1716', 'equipo:1717', 'equipo:1718', 'equipo:1719', 'equipo:1720', 'equipo:1721', 'equipo:1722', 'equipo:1723', 'equipo:1724', 'equipo:1725', 'equipo:1727', 'equipo:1728', 'equipo:1729', 'equipo:1730', 'equipo:1736', 'equipo:1737', 'equipo:2045', 'equipo:2046', 'equipo:2047', 'equipo:2048', 'equipo:2049', 'equipo:2050', 'equipo:2051', 'equipo:2055', 'equipo:2056', 'equipo:2057', 'equipo:2058', 'equipo:2059', 'equipo:2061', 'equipo:2062', 'equipo:2063', 'equipo:2064', 'equipo:2065', 'equipo:2066', 'equipo:2086', 'equipo:2088');

UPDATE public.clubs SET country = NULL, union_id = NULL, city = NULL, region = NULL, logo_url = NULL WHERE id = 'bizkaia-gernika';
-- Clubes creados por esta corrida
DELETE FROM public.clubs WHERE id IN ('getxo-rugby', 'barca-rugbi', 'fenix-rugby', 'ingenieros-industriales-las-rozas', 'valencia-rc', 'real-ciencias-sevilla', 'cp-les-abelles', 'cr-sant-cugat', 'hernani-cre', 'crat-coruna', 'rugby-majadahonda', 'buc-barcelona', 'universitario-bilbao', 'gaztedi-rt', 'universitario-sevilla-femenino', 'turia-rugby-femenino', 'atletico-portuense-femenino', 'eibar-rt-femenino', 'olimpico-de-pozuelo-femenino', 'cormoran-santander', 'donostia-rugby', 'belenos-rc', 'elorrio-rt', 'rugby-aranda', 'la-unica-rt', 'cau-valencia', 'vpc-andorra', 'cn-poble-nou', 'akra-barbara', 'rc-sitges', 'el-toro-rc', 'rc-ponent', 'car-sevilla', 'cr-alcala', 'jaen-rugby', 'car-caceres', 'soto-del-real', 'real-oviedo-rugby', 'os-ingleses', 'gijon-rc', 'universidade-de-vigo', 'complutense-cisneros-zeta', 'alcobendas-b', 'el-salvador-b', 'crat-coruna-femenino', 'el-salvador-femenino', 'rugby-majadahonda-femenino', 'cr-sant-cugat-femenino', 'getxo-rugby-femenino', 'buc-barcelona-femenino', 'ue-santboiana-femenino', 'universitario-bilbao-femenino', 'complutense-cisneros-femenino', 'gaztedi-rt-femenino', 'complutense-cisneros-m23', 'ampo-ordizia-m23', 'getxo-rugby-m23', 'alcobendas-m23', 'burgos-m23', 'valladolid-rac-m23', 'el-salvador-m23', 'hernani-cre-m23', 'bizkaia-gernika-m23', 'liceo-frances-m23', 'valencia-rc-m23', 'real-ciencias-sevilla-m23', 'pozuelo-m23', 'ue-santboiana-m23', 'cr-la-vila-m23', 'barca-rugbi-m23', 'cr-sant-cugat-m23', 'fenix-rugby-m23', 'ingenieros-industriales-las-rozas-m23', 'cp-les-abelles-m23');

COMMIT;
