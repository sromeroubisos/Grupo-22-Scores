-- Rollback de la carga histórica de rugbyarchive (Interior A/B/C + Nacional A/B).
-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las
-- temporadas 2026 del Interior A/B, cargadas a mano, no están en las listas.
BEGIN;
-- urba-top-14
DELETE FROM public.tournament_standings WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.matches WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.tournament_rounds WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.tournament_groups WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.tournament_phases WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.season_rosters WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.team_season_entries WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.tournament_participants WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992'));
DELETE FROM public.tournament_seasons WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e' AND season_code IN ('1989','1990','1991','1992');
-- primera-a-de-la-urba
DELETE FROM public.tournament_standings WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.matches WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.tournament_rounds WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.tournament_groups WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.tournament_phases WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.season_rosters WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.team_season_entries WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.tournament_participants WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006'));
DELETE FROM public.tournament_seasons WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc' AND season_code IN ('2006');
-- torneo-regionale-del-nea-1779542145074
DELETE FROM public.tournament_standings WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.matches WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.tournament_rounds WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.tournament_groups WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.tournament_phases WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.season_rosters WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.team_season_entries WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.tournament_participants WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011'));
DELETE FROM public.tournament_seasons WHERE tournament_id = 'b0562cf3-4ea1-463e-86cb-86988dc22f10' AND season_code IN ('2011');
COMMIT;
