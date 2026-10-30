-- Rollback de la carga histórica de rugbyarchive (Top 10 del Centro, 1931-2023).
-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las
-- temporadas 2024/2025/2026, cargadas a mano, no están en la lista.
BEGIN;
DELETE FROM public.tournament_standings WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.matches WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.tournament_rounds WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.tournament_groups WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.tournament_phases WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.season_rosters WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
-- participantes y entries se referencian mutuamente: primero soltar el vínculo
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.team_season_entries WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.tournament_participants WHERE season_id IN (SELECT id FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024'));
DELETE FROM public.tournament_seasons WHERE tournament_id = '55f28144-3d92-484b-a57d-646e06740808' AND season_code IN ('2024');
-- Clubes creados por esta carga. Borrarlos SOLO si no participan de otra cosa:
-- DELETE FROM public.clubs WHERE id IN ('escuela-de-aviacion','gimnasia-y-esgrima-cordoba','universidad-nacional-de-cordoba','universidad-tecnologica-cordoba','universidad-catolica-de-cordoba','jockey-club-rio-cuarto','villa-general-belgrano-r-c','conas-r-c','fusion-r-c');
-- Los aliases aprendidos en club_aliases son inocuos; limpiarlos es opcional.
COMMIT;
