-- El empate como tercera opcion de la votacion.
--
-- La tabla nacio con CHECK (choice IN ('home','away')). En rugby y en futbol el
-- empate es un resultado posible, asi que sin esa opcion la votacion obliga a
-- elegir un ganador que el votante no cree. Los votos ya guardados no se tocan.

ALTER TABLE public.match_votes
    DROP CONSTRAINT IF EXISTS match_votes_choice_check;

ALTER TABLE public.match_votes
    ADD CONSTRAINT match_votes_choice_check
    CHECK (choice IN ('home', 'draw', 'away'));
