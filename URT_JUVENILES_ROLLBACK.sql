-- Rollback de la carga del Dos Orillas juvenil y del Regional del Litoral M19.
-- Borra SÓLO lo que crearon las corridas de seed.mjs. Los clubes van último.
BEGIN;

-- urt-juvenil-m15
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m15';

-- urt-juvenil-m16
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m16';

-- urt-juvenil-m17
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m17';

-- urt-juvenil-m19
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m19';

-- urt-juvenil-m15-reserva
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m15-reserva';

-- urt-juvenil-m16-reserva
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m16-reserva';

-- urt-juvenil-m17-reserva
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m17-reserva';

-- urt-juvenil-m19-reserva
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva');
DELETE FROM public.tournaments WHERE slug = 'urt-juvenil-m19-reserva';

-- Vínculos de familia
DELETE FROM public.club_derivatives WHERE derived_club_id IN ('tucuman-rugby-club-verde-m15', 'universitario-de-tucuman-m15', 'los-tarcos-m15', 'cardenales-r-c-m15', 'huirapuca-m15', 'jockey-club-de-tucuman-m15', 'tucuman-rugby-club-negro-m15', 'tucuman-lawn-tennis-m15', 'lince-rugby-club-m15', 'natacion-y-gimnasia-m15', 'tucuman-rugby-club-verde-m16', 'cardenales-r-c-m16', 'universitario-de-tucuman-m16', 'los-tarcos-m16', 'huirapuca-m16', 'tucuman-lawn-tennis-m16', 'natacion-y-gimnasia-m16', 'aguara-guazu-m16', 'lince-rugby-club-m16', 'tucuman-rugby-club-negro-m16', 'jockey-club-de-tucuman-m16', 'tucuman-lawn-tennis-azul-m16', 'tucuman-rugby-club-verde-m17', 'cardenales-r-c-m17', 'los-tarcos-m17', 'universitario-de-tucuman-m17', 'huirapuca-m17', 'tucuman-lawn-tennis-m17', 'natacion-y-gimnasia-m17', 'jockey-club-de-tucuman-m17', 'tucuman-rugby-club-negro-m17', 'lince-rugby-club-m17', 'universitario-de-tucuman-azul-m19', 'los-tarcos-m19', 'tucuman-rugby-club-verde-m19', 'cardenales-r-c-m19', 'huirapuca-m19', 'lince-rugby-club-m19', 'natacion-y-gimnasia-m19', 'tucuman-lawn-tennis-m19', 'tucuman-rugby-club-negro-m19', 'jockey-club-de-tucuman-m19', 'aguara-guazu-m19', 'tucuman-rugby-club-negro-m15-b', 'jockey-club-de-tucuman-m15-b', 'tucuman-lawn-tennis-m15-b', 'la-querencia-m15', 'universitario-de-tucuman-m15-b', 'tucuman-rugby-club-verde-m15-b', 'aguara-guazu-m15', 'los-tarcos-m15-b', 'tucuman-lawn-tennis-m16-b', 'jockey-club-de-tucuman-m16-b', 'tucuman-rugby-club-negro-m16-b', 'natacion-y-gimnasia-m16-b', 'universitario-de-tucuman-m16-b', 'tucuman-rugby-club-verde-m16-b', 'los-tarcos-m16-b', 'huirapuca-m16-b', 'tucuman-lawn-tennis-blanco-m16', 'tucuman-lawn-tennis-azul-m16-b', 'universitario-de-tucuman-m17-b', 'cardenales-r-c-m17-b', 'huirapuca-m17-b', 'los-tarcos-m17-b', 'tucuman-lawn-tennis-m17-b', 'tucuman-rugby-club-negro-m17-b', 'natacion-y-gimnasia-m17-b', 'jockey-club-de-tucuman-m17-b', 'universitario-de-tucuman-azul-m19-b', 'los-tarcos-m19-b', 'huirapuca-m19-b', 'cardenales-r-c-m19-b', 'san-martin-rugby-club-tucuman-m19', 'universitario-de-tucuman-gris-m19', 'natacion-y-gimnasia-m19-b', 'lince-rugby-club-m19-b', 'tucuman-rugby-club-negro-m19-b', 'coipu-r-c-m19', 'tucuman-lawn-tennis-m19-b', 'jockey-club-de-tucuman-m19-b', 'tucuman-lawn-tennis-azul-m19', 'liceo-rugby-club-tucuman-m19', 'tucuman-lawn-tennis-blanco-m19');

-- Fichas juveniles y clubes madre creados
DELETE FROM public.clubs WHERE id IN ('liceo-rugby-club-tucuman', 'san-martin-rugby-club-tucuman', 'tucuman-rugby-club-verde-m15', 'universitario-de-tucuman-m15', 'los-tarcos-m15', 'cardenales-r-c-m15', 'huirapuca-m15', 'jockey-club-de-tucuman-m15', 'tucuman-rugby-club-negro-m15', 'tucuman-lawn-tennis-m15', 'lince-rugby-club-m15', 'natacion-y-gimnasia-m15', 'tucuman-rugby-club-verde-m16', 'cardenales-r-c-m16', 'universitario-de-tucuman-m16', 'los-tarcos-m16', 'huirapuca-m16', 'tucuman-lawn-tennis-m16', 'natacion-y-gimnasia-m16', 'aguara-guazu-m16', 'lince-rugby-club-m16', 'tucuman-rugby-club-negro-m16', 'jockey-club-de-tucuman-m16', 'tucuman-lawn-tennis-azul-m16', 'tucuman-rugby-club-verde-m17', 'cardenales-r-c-m17', 'los-tarcos-m17', 'universitario-de-tucuman-m17', 'huirapuca-m17', 'tucuman-lawn-tennis-m17', 'natacion-y-gimnasia-m17', 'jockey-club-de-tucuman-m17', 'tucuman-rugby-club-negro-m17', 'lince-rugby-club-m17', 'universitario-de-tucuman-azul-m19', 'los-tarcos-m19', 'tucuman-rugby-club-verde-m19', 'cardenales-r-c-m19', 'huirapuca-m19', 'lince-rugby-club-m19', 'natacion-y-gimnasia-m19', 'tucuman-lawn-tennis-m19', 'tucuman-rugby-club-negro-m19', 'jockey-club-de-tucuman-m19', 'aguara-guazu-m19', 'tucuman-rugby-club-negro-m15-b', 'jockey-club-de-tucuman-m15-b', 'tucuman-lawn-tennis-m15-b', 'la-querencia-m15', 'universitario-de-tucuman-m15-b', 'tucuman-rugby-club-verde-m15-b', 'aguara-guazu-m15', 'los-tarcos-m15-b', 'tucuman-lawn-tennis-m16-b', 'jockey-club-de-tucuman-m16-b', 'tucuman-rugby-club-negro-m16-b', 'natacion-y-gimnasia-m16-b', 'universitario-de-tucuman-m16-b', 'tucuman-rugby-club-verde-m16-b', 'los-tarcos-m16-b', 'huirapuca-m16-b', 'tucuman-lawn-tennis-blanco-m16', 'tucuman-lawn-tennis-azul-m16-b', 'universitario-de-tucuman-m17-b', 'cardenales-r-c-m17-b', 'huirapuca-m17-b', 'los-tarcos-m17-b', 'tucuman-lawn-tennis-m17-b', 'tucuman-rugby-club-negro-m17-b', 'natacion-y-gimnasia-m17-b', 'jockey-club-de-tucuman-m17-b', 'universitario-de-tucuman-azul-m19-b', 'los-tarcos-m19-b', 'huirapuca-m19-b', 'cardenales-r-c-m19-b', 'san-martin-rugby-club-tucuman-m19', 'universitario-de-tucuman-gris-m19', 'natacion-y-gimnasia-m19-b', 'lince-rugby-club-m19-b', 'tucuman-rugby-club-negro-m19-b', 'coipu-r-c-m19', 'tucuman-lawn-tennis-m19-b', 'jockey-club-de-tucuman-m19-b', 'tucuman-lawn-tennis-azul-m19', 'liceo-rugby-club-tucuman-m19', 'tucuman-lawn-tennis-blanco-m19');

COMMIT;
