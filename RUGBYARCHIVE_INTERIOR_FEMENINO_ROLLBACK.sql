-- Rollback de la carga histórica de rugbyarchive (Interior A/B/C + Nacional A/B).
-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las
-- temporadas 2026 del Interior A/B, cargadas a mano, no están en las listas.
BEGIN;
-- nacional-de-clubes-femenino
DELETE FROM public.tournament_standings WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.matches WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.tournament_rounds WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.tournament_groups WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.tournament_phases WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.season_rosters WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.team_season_entries WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.tournament_participants WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025'));
DELETE FROM public.tournament_seasons WHERE tournament_id = '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' AND season_code IN ('2011','2012','2013','2014','2015','2016','2017','2018','2019','2021','2022','2023','2024','2025');
-- Clubes creados por esta carga. Borrarlos SOLO si no participan de otra cosa:
-- DELETE FROM public.clubs WHERE id IN ('las-teras','g-e-i','san-isidro-de-lules','nevado','alto-valle','pumai','sirenas-smata','echague','villa-gesell-r-c','alberdi','unsl','universitario-de-villa-mercedes','universitario-de-tierra-del-fuego','universidad-catolica-de-salta','granaderas-red-star','argentino-de-trenque-lauquen','salto-del-guaira');
COMMIT;
