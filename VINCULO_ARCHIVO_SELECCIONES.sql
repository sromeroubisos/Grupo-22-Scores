-- Vincula cada seleccion de FlashScore con su ficha del archivo historico.
--
-- Por que: el buscador ahora ofrece UN club por nombre y deporte, y el que gana es
-- el del proveedor habilitado (FlashScore). Su historial de archivo solo se lee si
-- la fila lleva `rugbyarchive_id`: sin el, los partidos guardados bajo
-- 'ra-team-<id>' quedan sin puerta. Argentina ya estaba vinculada y muestra 498
-- partidos; estas 19 no, y entre todas dejan 419 partidos sin alcanzar.
--
-- Es aditivo: solo escribe donde hoy hay NULL. Rollback en el archivo hermano.

UPDATE external_teams SET rugbyarchive_id = '596' WHERE id = 'rBp21jRs' AND rugbyarchive_id IS NULL; -- Australia <- ra-team-596
UPDATE external_teams SET rugbyarchive_id = '597' WHERE id = 'ULLKn6st' AND rugbyarchive_id IS NULL; -- Canada <- ra-team-597
UPDATE external_teams SET rugbyarchive_id = '891' WHERE id = 'r7ySc5vq' AND rugbyarchive_id IS NULL; -- Chile <- ra-team-891
UPDATE external_teams SET rugbyarchive_id = '604' WHERE id = 'SlDs7uK8' AND rugbyarchive_id IS NULL; -- England <- ra-team-604
UPDATE external_teams SET rugbyarchive_id = '599' WHERE id = 'QZZ60Atl' AND rugbyarchive_id IS NULL; -- Fiji <- ra-team-599
UPDATE external_teams SET rugbyarchive_id = '600' WHERE id = 'GE9w8L42' AND rugbyarchive_id IS NULL; -- France <- ra-team-600
UPDATE external_teams SET rugbyarchive_id = '602' WHERE id = 'zaPoCRC9' AND rugbyarchive_id IS NULL; -- Georgia <- ra-team-602
UPDATE external_teams SET rugbyarchive_id = '605' WHERE id = 'l41j5JlL' AND rugbyarchive_id IS NULL; -- Ireland <- ra-team-605
UPDATE external_teams SET rugbyarchive_id = '606' WHERE id = 'dY0G5w4R' AND rugbyarchive_id IS NULL; -- Italy <- ra-team-606
UPDATE external_teams SET rugbyarchive_id = '603' WHERE id = 'Ofy9dbhS' AND rugbyarchive_id IS NULL; -- Japan <- ra-team-603
UPDATE external_teams SET rugbyarchive_id = '608' WHERE id = '6kV5bUef' AND rugbyarchive_id IS NULL; -- New Zealand <- ra-team-608
UPDATE external_teams SET rugbyarchive_id = '609' WHERE id = 'vXVxEmrc' AND rugbyarchive_id IS NULL; -- Romania <- ra-team-609
UPDATE external_teams SET rugbyarchive_id = '611' WHERE id = 'v3TDd8Q6' AND rugbyarchive_id IS NULL; -- Samoa <- ra-team-611
UPDATE external_teams SET rugbyarchive_id = '612' WHERE id = 'AD2n6aZE' AND rugbyarchive_id IS NULL; -- Scotland <- ra-team-612
UPDATE external_teams SET rugbyarchive_id = '614' WHERE id = 'bHmPcrZk' AND rugbyarchive_id IS NULL; -- South Africa <- ra-team-614
UPDATE external_teams SET rugbyarchive_id = '102' WHERE id = 'K2XoAXYj' AND rugbyarchive_id IS NULL; -- Spain <- ra-team-102
UPDATE external_teams SET rugbyarchive_id = '615' WHERE id = 'zZIvcSuD' AND rugbyarchive_id IS NULL; -- Tonga <- ra-team-615
UPDATE external_teams SET rugbyarchive_id = '616' WHERE id = 'zVJC3zB0' AND rugbyarchive_id IS NULL; -- Uruguay <- ra-team-616
UPDATE external_teams SET rugbyarchive_id = '601' WHERE id = 'bgcmqxS1' AND rugbyarchive_id IS NULL; -- Wales <- ra-team-601
