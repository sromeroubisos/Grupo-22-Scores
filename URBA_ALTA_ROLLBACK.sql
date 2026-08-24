-- Rollback del alta de 2 torneos de URBA. Generado ANTES de ejecutar.
-- urba:2025318 "Rugby Formativo - Campeonato A" · urba:2025320 "Rugby Formativo - Campeonato B"
--
-- El corte son los external_id EXACTOS de esta corrida: no toca ningún otro torneo.
-- El orden es hijo -> padre: las FK no admiten el inverso.

BEGIN;

-- 1. Partidos
DELETE FROM public.matches m USING public.tournaments t
  WHERE m.tournament_id = t.id AND t.external_id IN ('urba:2025318', 'urba:2025320');

-- 2. Participantes
DELETE FROM public.tournament_participants p USING public.tournaments t
  WHERE p.tournament_id = t.id AND t.external_id IN ('urba:2025318', 'urba:2025320')
    AND p.notes = 'urba-import';

-- 3. Inscripciones en la fase
DELETE FROM public.tournament_phase_participants i USING public.tournaments t
  WHERE i.tournament_id = t.id AND t.external_id IN ('urba:2025318', 'urba:2025320');

-- 4. Fases
DELETE FROM public.tournament_phases f USING public.tournaments t
  WHERE f.tournament_id = t.id AND t.external_id IN ('urba:2025318', 'urba:2025320');

-- 5. Torneos
DELETE FROM public.tournaments WHERE external_id IN ('urba:2025318', 'urba:2025320');

COMMIT;
