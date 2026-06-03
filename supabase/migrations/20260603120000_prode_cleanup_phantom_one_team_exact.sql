-- Limpieza del valor fantasma `oneTeamExact` en el prode.
--
-- Contexto: el wizard de creación de ligas privadas expone solo 3 reglas
-- (ganador / diferencia / marcador exacto). Sin embargo, el normalizador del
-- backend forzaba históricamente `oneTeamExact: 1` en cada liga creada (y en el
-- `defaultPrivateLeagueRules` de las competencias auto-creadas). Eso producía:
--   * Una regla "Un equipo exacto = 1 pt" que el creador nunca configuró ni vio.
--   * Puntos reales otorgados por esa regla.
--   * Divergencia silenciosa: la liga global de la misma competencia resuelve
--     `oneTeamExact = null` (0 pts), así que un mismo acierto valía 1 en la liga
--     privada y 0 en la global.
--
-- El código ya dejó de inyectar ese default (solo se incluye `oneTeamExact` si se
-- envía explícitamente). Esta migración limpia los datos YA persistidos para que
-- las ligas y competencias existentes queden consistentes con el comportamiento
-- nuevo y con la liga global.
--
-- Solo se eliminan los valores exactamente iguales a 1 (el default fantasma). No
-- existía ninguna vía de UI para fijar un valor distinto de 1, así que esto no
-- toca configuraciones intencionales. Los rulesets propios (scoring_model) no se
-- modifican. El historial de reglas (`rulesHistory`) es auditoría y se conserva.

BEGIN;

-- Ligas privadas: quita rules.oneTeamExact cuando es el default fantasma (= 1).
UPDATE public.prode_private_leagues
SET metadata = metadata #- '{rules,oneTeamExact}'
WHERE (metadata #> '{rules,oneTeamExact}') = '1'::jsonb;

-- Competencias auto-creadas: quita defaultPrivateLeagueRules.oneTeamExact (= 1),
-- que es una de las fuentes que leen el motor de scoring y el resumen de reglas.
UPDATE public.prode_competitions
SET metadata = metadata #- '{defaultPrivateLeagueRules,oneTeamExact}'
WHERE (metadata #> '{defaultPrivateLeagueRules,oneTeamExact}') = '1'::jsonb;

COMMIT;
