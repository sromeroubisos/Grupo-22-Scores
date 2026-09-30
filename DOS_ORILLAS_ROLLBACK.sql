-- Rollback de la carga del Dos Orillas juvenil y del Regional del Litoral M19.
-- Borra SÓLO lo que crearon las corridas de seed.mjs. Los clubes van último.
BEGIN;

-- dos-orillas-juvenil-m15
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15');
DELETE FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m15';

-- dos-orillas-juvenil-m16
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16');
DELETE FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m16';

-- dos-orillas-juvenil-m17
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17');
DELETE FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m17';

-- dos-orillas-juvenil-m19
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19');
DELETE FROM public.tournaments WHERE slug = 'dos-orillas-juvenil-m19';

-- torneo-regional-del-litoral-m19-a
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a');
DELETE FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-a';

-- torneo-regional-del-litoral-m19-b
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b');
DELETE FROM public.tournaments WHERE slug = 'torneo-regional-del-litoral-m19-b';

-- Vínculos de familia
DELETE FROM public.club_derivatives WHERE derived_club_id IN ('alma-juniors-m15', 'alma-juniors-m16', 'alma-juniors-m17', 'alma-juniors-m19', 'atletico-brown-san-vicente-m15', 'atletico-brown-san-vicente-m16', 'atletico-brown-san-vicente-m17', 'atletico-del-rosario-m19', 'brown-san-carlos-m16', 'capiba-rugby-club-m15', 'capiba-rugby-club-m16', 'capiba-rugby-club-m17', 'cha-roga-querandi-m17', 'cha-roga-r-c-m15', 'cha-roga-r-c-m16', 'cha-roga-r-c-m17', 'cha-roga-r-c-m19', 'club-tilcara-m15', 'club-tilcara-m16', 'club-tilcara-m17', 'club-tilcara-m19', 'club-tilcara-m19-b', 'crai-m15', 'crai-m16', 'crai-m17', 'crai-m19', 'crai-m19-b', 'crar-m15', 'crar-m16', 'crar-m17', 'crar-m19', 'crar-m19-b', 'duendes-r-c-m19', 'estudiantes-de-parana-m15', 'estudiantes-de-parana-m16', 'estudiantes-de-parana-m17', 'estudiantes-de-parana-m17-b', 'estudiantes-de-parana-m19', 'estudiantes-de-parana-m19-b', 'gimnasia-y-esgrima-de-rosario-m19', 'jockey-club-de-rosario-m19', 'jockey-club-de-venado-tuerto-m19', 'la-salle-jobson-m15', 'la-salle-jobson-m16', 'la-salle-jobson-m17', 'la-salle-jobson-m19', 'los-caranchos-m19', 'nautico-el-quilla-m15', 'nautico-el-quilla-m16', 'nautico-el-quilla-m17', 'old-resian-club-m19', 'parana-rowing-m15', 'parana-rowing-m16', 'parana-rowing-m17', 'parana-rowing-m19', 'parana-rowing-m19-b', 'querandi-r-c-m15', 'querandi-r-c-m16', 'querandi-r-c-m17', 'querandi-r-c-m19', 'san-carlos-r-c-santa-fe-m16', 'san-carlos-r-c-santa-fe-m17', 'santa-fe-r-c-m15', 'santa-fe-r-c-m15-b', 'santa-fe-r-c-m16', 'santa-fe-r-c-m16-b', 'santa-fe-r-c-m17', 'santa-fe-r-c-m17-b', 'santa-fe-r-c-m19', 'santa-fe-r-c-m19-b', 'universitario-de-santa-fe-m15', 'universitario-de-santa-fe-m16', 'universitario-de-santa-fe-m17', 'universitario-de-santa-fe-m19', 'universitario-de-santa-fe-m19-b', 'brown-san-jorge-m15', 'crai-m16-b', 'brown-san-jorge-m17', 'capiba-rugby-club-m19', 'atletico-brown-san-vicente-m19');

-- Fichas juveniles y clubes madre creados
DELETE FROM public.clubs WHERE id IN ('alma-juniors-m15', 'alma-juniors-m16', 'alma-juniors-m17', 'alma-juniors-m19', 'atletico-brown-san-vicente-m15', 'atletico-brown-san-vicente-m16', 'atletico-brown-san-vicente-m17', 'atletico-del-rosario-m19', 'brown-san-carlos-m16', 'capiba-rugby-club', 'capiba-rugby-club-m15', 'capiba-rugby-club-m16', 'capiba-rugby-club-m17', 'cha-roga-querandi-m17', 'cha-roga-r-c-m15', 'cha-roga-r-c-m16', 'cha-roga-r-c-m17', 'cha-roga-r-c-m19', 'club-tilcara-m15', 'club-tilcara-m16', 'club-tilcara-m17', 'club-tilcara-m19', 'club-tilcara-m19-b', 'crai-m15', 'crai-m16', 'crai-m17', 'crai-m19', 'crai-m19-b', 'crar-m15', 'crar-m16', 'crar-m17', 'crar-m19', 'crar-m19-b', 'duendes-r-c-m19', 'estudiantes-de-parana-m15', 'estudiantes-de-parana-m16', 'estudiantes-de-parana-m17', 'estudiantes-de-parana-m17-b', 'estudiantes-de-parana-m19', 'estudiantes-de-parana-m19-b', 'gimnasia-y-esgrima-de-rosario-m19', 'jockey-club-de-rosario-m19', 'jockey-club-de-venado-tuerto-m19', 'la-salle-jobson-m15', 'la-salle-jobson-m16', 'la-salle-jobson-m17', 'la-salle-jobson-m19', 'los-caranchos-m19', 'nautico-el-quilla', 'nautico-el-quilla-m15', 'nautico-el-quilla-m16', 'nautico-el-quilla-m17', 'old-resian-club-m19', 'parana-rowing-m15', 'parana-rowing-m16', 'parana-rowing-m17', 'parana-rowing-m19', 'parana-rowing-m19-b', 'querandi-r-c', 'querandi-r-c-m15', 'querandi-r-c-m16', 'querandi-r-c-m17', 'querandi-r-c-m19', 'san-carlos-r-c-santa-fe', 'san-carlos-r-c-santa-fe-m16', 'san-carlos-r-c-santa-fe-m17', 'santa-fe-r-c-m15-b', 'santa-fe-r-c-m16', 'santa-fe-r-c-m16-b', 'santa-fe-r-c-m17', 'santa-fe-r-c-m17-b', 'santa-fe-r-c-m19', 'santa-fe-r-c-m19-b', 'universitario-de-santa-fe-m15', 'universitario-de-santa-fe-m16', 'universitario-de-santa-fe-m17', 'universitario-de-santa-fe-m19', 'universitario-de-santa-fe-m19-b', 'brown-san-jorge-m15', 'crai-m16-b', 'brown-san-jorge-m17', 'capiba-rugby-club-m19', 'atletico-brown-san-vicente-m19');

UPDATE public.clubs SET logo_url = NULL WHERE id = 'atletico-brown-san-vicente';

COMMIT;
