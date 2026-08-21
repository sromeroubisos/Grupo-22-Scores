-- Rollback de la corrección de San José en URBA: DESARROLLO - Superior 2026.
-- Generado ANTES de ejecutar. Devuelve todo al estado previo.
--
-- Torneo: e0e20e06-8c98-4804-9edc-2cc978b7da56
-- Devuelve 18 partidos, 1 participante, 1 fila(s) de posiciones
-- y el triple urba '83|mayores|' a 'san-jose', y restituye la ficha de 'san-jose-buenos-aires'.

BEGIN;

-- 1. El mapeo del conector
UPDATE public.club_external_ids SET club_id = 'san-jose'
  WHERE provider = 'urba' AND external_id = '83|mayores|';

-- 2. La ficha del club (el archivo queda en Storage; la columna vuelve a su valor)
UPDATE public.clubs SET name = 'San José (Buenos Aires)', short_name = 'San José BA',
       logo_url = NULL, city = 'Buenos Aires', region = 'Buenos Aires'
  WHERE id = 'san-jose-buenos-aires';

-- 3. El participante del torneo
UPDATE public.tournament_participants SET club_id = 'san-jose', name = 'San José'
  WHERE id = '2794203c-8cb1-45f6-8753-cf44911e4e92';

-- 4. Los partidos, uno por uno y por lado: sólo el lado que era suyo
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '8c019fa4-e43f-4ee3-9a30-b499ff800c32';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '5d2c382a-8272-4744-85de-0689523a0293';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '8993b9b3-834a-4350-b614-a855d6e42586';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '9a2eee93-dd9b-4b1a-b6db-a233b148b128';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '70b74f95-5b19-4139-91c9-5a0012207397';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '9b15b51d-900e-40ff-a694-20e1be75e262';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = 'bbe14578-7c8f-4e6f-bdff-c59810f1290c';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '759ad31c-f895-4055-ba0c-5b4b7ae3c865';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '211911c1-7c7c-47a5-b384-491546d003c3';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = 'a06e6606-abc4-4c1b-9a54-de628fe83f86';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '5641409e-38e7-4b52-99d5-6be805b48576';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = 'fec3a3e3-1f1c-45be-b460-8ee1bb5c4a10';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '80ef435c-81f2-423f-9e5f-4b55a2f3c04f';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '51a6c48f-5f02-4111-93a9-4c0f99c93281';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '5558ee16-e30d-4d53-9066-96ab237b3375';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '75b96521-c157-416b-8fdc-3f01cd3bc35f';
UPDATE public.matches SET away_club_id = 'san-jose' WHERE id = '1dc5a9ad-e3e1-4a16-a991-edbb1dbc3300';
UPDATE public.matches SET home_club_id = 'san-jose' WHERE id = '1489adfc-2315-440c-9a25-8ed636e8d49d';

-- 5. La tabla de posiciones
UPDATE public.tournament_standings SET club_id = 'san-jose' WHERE id = '0fca735f-7eeb-4183-8928-856b58f9908b';

COMMIT;
