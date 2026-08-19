-- El 1 de julio de 2026 World Rugby saco la ventaja de local del calculo del
-- ranking, en el masculino y en el femenino. Es el primer cambio de formula
-- desde que el ranking nacio, en octubre de 2003. El motivo: cada vez mas tests
-- se juegan en sede neutral y el handicap terminaba castigando al equipo que
-- figuraba como local sin jugar en su cancha.
--
-- La formula del intercambio no cambia en nada mas. Con A y B los puntajes
-- previos, el que gana se lleva (10 + B - A) x 0,10 (x 0,15 si gana por 16 o
-- mas), y el empate mueve |A - B| x 0,10 hacia el mas flojo. Sacar la ventaja
-- de local es poner en cero el termino que se le sumaba a A antes de comparar.

ALTER TABLE public.club_rankings
    ALTER COLUMN home_advantage SET DEFAULT 0;

-- Los rankings que ya existen quedan alineados con la formula vigente. Es una
-- sola celda por ranking: el recalculo semanal rehace la tabla entera desde los
-- puntajes iniciales, asi que la proxima corrida re-deriva todo con el valor
-- nuevo sin necesidad de tocar una sola fila de club_ranking_entries.
UPDATE public.club_rankings
SET home_advantage = 0
WHERE algorithm = 'world_rugby'
  AND home_advantage <> 0;

COMMENT ON COLUMN public.club_rankings.home_advantage IS
    'Puntos que se le suman al local antes de comparar puntajes. Cero desde el cambio de World Rugby del 2026-07-01; se deja como columna para poder reactivarla por ranking.';
