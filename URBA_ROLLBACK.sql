-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK COMPLETO DE LA CARGA DE URBA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La carga hizo tres cosas que un DELETE no deshace:
--   · borró 1.256 partidos cargados a mano en 8 torneos
--   · borró 72 participantes (los del campeonato vecino, en 4 juveniles)
--   · repuntó 182 prode_events del Top 14, del partido manual al de URBA
--
-- Por eso el rollback NO es un solo archivo. Hay que correr CUATRO, EN ESTE
-- ORDEN. El orden no es cosmético: si se borran los partidos de URBA antes de
-- soltar el prode, el CHECK `prode_events_source_binding_chk` lo rechaza — el FK
-- pone `local_match_id` en NULL y la fila queda inválida. Es el mismo 23514 que
-- frenó el paso 3.
--
--   1) psql -f URBA_BACKUP_MANUALES.sql        1.256 INSERT, ids originales
--   2) psql -f URBA_BACKUP_PRODE.sql             182 UPDATE, prode vuelve al manual
--   3) psql -f URBA_BACKUP_PARTICIPANTES.sql      72 INSERT
--   4) psql -f URBA_ROLLBACK.sql                este archivo
--
-- Los pasos 1 a 3 restauran lo borrado. Este archivo borra lo agregado.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Los partidos importados de URBA, en los 134 torneos.
--    Se lleva puesto el phase_id que les asignó el paso 4: no hay que revertirlo
--    aparte. Falla si todavía no corrió URBA_BACKUP_PRODE.sql.
DELETE FROM public.matches WHERE external_id LIKE 'urba:%';
--    esperado: 10917 filas

-- 2. Los participantes que creó la carga.
--    `notes` estaba sin usar en las 766 filas previas de la tabla, así que la
--    marca no pisa nada y el borrado es exacto. La lista explícita de los 1.487
--    pares (tournament_id, club_id) está en URBA_EXECUTE_LOG.jsonl.
DELETE FROM public.tournament_participants WHERE notes = 'urba-import';
--    esperado: 1487 filas

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN DESPUÉS DE LOS CUATRO PASOS
-- ═══════════════════════════════════════════════════════════════════════════
--   SELECT count(*) FROM public.matches;                         -- 3898
--   SELECT count(*) FROM public.tournament_participants;          -- 766
--   SELECT count(*) FROM public.prode_events
--     WHERE source_type = 'local' AND local_match_id IS NULL;     -- 0
--   SELECT count(*) FROM public.prode_predictions;                -- 783
--   SELECT count(*) FROM public.match_events;                     -- 2757
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE BORRÓ EL PASO 3, POR TORNEO
-- ═══════════════════════════════════════════════════════════════════════════
--   urba:2025176   182 manuales   Top 14 de la URBA        (+182 prode_events)
--   urba:2025177   182 manuales   Primera "A" de la URBA
--   urba:2025178   182 manuales   Primera "B" de la URBA
--   urba:2025179   182 manuales   Primera "C" de la URBA
--   urba:2025213   132 manuales   MENORES DE 19 - G2 NIVEL 1 "A"
--   urba:2025215   132 manuales   MENORES DE 19 - G2 NIVEL 1 "B"
--   urba:2025231   132 manuales   Menores de 17 - G2 NIVEL 1 "A"
--   urba:2025233   132 manuales   Menores de 17 - G2 NIVEL 1 "B"
--   TOTAL 1256
--
-- LO QUE BORRÓ EL PASO 5
--   urba:2025213  12 participantes · urba:2025215  24
--   urba:2025231  12 participantes · urba:2025233  24
--   TOTAL 72   (ninguno llevaba la marca urba-import: son todos previos)
--
-- LO QUE NO SE TOCÓ
--   los otros 126 torneos de URBA · clubs · club_external_ids · el ruleset
--   los 2.757 match_events · la visibilidad de nada · el cron
