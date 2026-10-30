-- Rollback de la carga del Dos Orillas juvenil y del Regional del Litoral M19.
-- Borra SÓLO lo que crearon las corridas de seed.mjs. Los clubes van último.
BEGIN;

-- urt-tucumano-a-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-tucumano-a-intermedia';

-- urt-tucumano-b-primera
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera');
DELETE FROM public.tournaments WHERE slug = 'urt-tucumano-b-primera';

-- urt-tucumano-b-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-tucumano-b-intermedia';

-- urt-regional-noa-a-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-regional-noa-a-intermedia';

-- urt-regional-noa-b-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-regional-noa-b-intermedia';

-- urt-regional-noa-c-primera
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera');
DELETE FROM public.tournaments WHERE slug = 'urt-regional-noa-c-primera';

-- urt-regional-noa-c-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-regional-noa-c-intermedia';

-- urt-desarrollo-primera
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-primera');
DELETE FROM public.tournaments WHERE slug = 'urt-desarrollo-primera';

-- urt-desarrollo-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-desarrollo-intermedia';

-- urt-clausura-desarrollo-primera
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera');
DELETE FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-primera';

-- urt-clausura-desarrollo-intermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-clausura-desarrollo-intermedia';

-- urt-anual-preintermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-anual-preintermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-anual-preintermedia';

-- urt-iniciacion-preintermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-iniciacion-preintermedia';

-- urt-bi-uniones-preintermedia
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia');
DELETE FROM public.tournaments WHERE slug = 'urt-bi-uniones-preintermedia';

-- urt-m23
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'urt-m23');
DELETE FROM public.tournaments WHERE slug = 'urt-m23';

-- Vínculos de familia
DELETE FROM public.club_derivatives WHERE derived_club_id IN ('tucuman-rugby-club-intermedia', 'tucuman-lawn-tennis-intermedia', 'universitario-de-tucuman-intermedia', 'huirapuca-intermedia', 'jockey-club-de-tucuman-intermedia', 'natacion-y-gimnasia-intermedia', 'los-tarcos-intermedia', 'cardenales-r-c-intermedia', 'lince-rugby-club-intermedia', 'tafi-viejo-r-c-intermedia', 'aguara-guazu-intermedia', 'san-martin-rugby-club-tucuman-intermedia', 'liceo-rugby-club-tucuman-intermedia', 'monteros-r-c-intermedia', 'los-alisos-rugby-club-intermedia', 'coipu-r-c-intermedia', 'la-querencia-intermedia', 'corsarios-r-c-intermedia', 'bajo-hondo-intermedia', 'san-isidro-de-lules-intermedia', 'jockey-club-salta-intermedia', 'universitario-de-salta-intermedia', 'tigres-r-c-intermedia', 'old-lions-r-c-intermedia', 'gimnasia-y-tiro-intermedia', 'santiago-lawn-tennis-club-intermedia', 'santiago-rugby-club-intermedia', 'tiro-federal-salta-intermedia', 'anatuya-r-c-intermedia', 'suri-r-c-intermedia', 'atletico-gimnasia-y-esgrima-de-jujuy-intermedia', 'tucuman-rugby-club-preintermedia-b', 'tucuman-lawn-tennis-preintermedia-b', 'tucuman-rugby-club-preintermedia-a', 'tucuman-lawn-tennis-preintermedia-a', 'universitario-de-tucuman-preintermedia-a', 'lince-rugby-club-preintermedia', 'natacion-y-gimnasia-preintermedia', 'los-tarcos-preintermedia', 'universitario-de-tucuman-preintermedia-b', 'jockey-club-de-tucuman-preintermedia', 'cardenales-r-c-preintermedia', 'huirapuca-preintermedia', 'tucuman-rugby-club-preintermedia', 'universitario-de-tucuman-preintermedia', 'santiago-lawn-tennis-club-preintermedia', 'old-lions-r-c-preintermedia', 'santiago-rugby-club-preintermedia', 'tucuman-lawn-tennis-preintermedia', 'los-tarcos-m23', 'universitario-de-tucuman-m23', 'tucuman-lawn-tennis-m23', 'natacion-y-gimnasia-m23', 'tucuman-rugby-club-m23', 'huirapuca-m23', 'jockey-club-de-tucuman-m23', 'lince-rugby-club-m23');

-- Fichas juveniles y clubes madre creados
DELETE FROM public.clubs WHERE id IN ('tafi-viejo-r-c', 'los-alisos-rugby-club', 'anatuya-r-c', 'cobras-rugby-club', 'santa-ana-rugby-club', 'atletico-gimnasia-y-esgrima-de-jujuy', 'tucuman-rugby-club-intermedia', 'tucuman-lawn-tennis-intermedia', 'universitario-de-tucuman-intermedia', 'huirapuca-intermedia', 'jockey-club-de-tucuman-intermedia', 'natacion-y-gimnasia-intermedia', 'los-tarcos-intermedia', 'cardenales-r-c-intermedia', 'lince-rugby-club-intermedia', 'tafi-viejo-r-c-intermedia', 'aguara-guazu-intermedia', 'san-martin-rugby-club-tucuman-intermedia', 'liceo-rugby-club-tucuman-intermedia', 'monteros-r-c-intermedia', 'los-alisos-rugby-club-intermedia', 'coipu-r-c-intermedia', 'la-querencia-intermedia', 'corsarios-r-c-intermedia', 'bajo-hondo-intermedia', 'san-isidro-de-lules-intermedia', 'jockey-club-salta-intermedia', 'universitario-de-salta-intermedia', 'tigres-r-c-intermedia', 'old-lions-r-c-intermedia', 'gimnasia-y-tiro-intermedia', 'santiago-lawn-tennis-club-intermedia', 'santiago-rugby-club-intermedia', 'tiro-federal-salta-intermedia', 'anatuya-r-c-intermedia', 'suri-r-c-intermedia', 'atletico-gimnasia-y-esgrima-de-jujuy-intermedia', 'tucuman-rugby-club-preintermedia-b', 'tucuman-lawn-tennis-preintermedia-b', 'tucuman-rugby-club-preintermedia-a', 'tucuman-lawn-tennis-preintermedia-a', 'universitario-de-tucuman-preintermedia-a', 'lince-rugby-club-preintermedia', 'natacion-y-gimnasia-preintermedia', 'los-tarcos-preintermedia', 'universitario-de-tucuman-preintermedia-b', 'jockey-club-de-tucuman-preintermedia', 'cardenales-r-c-preintermedia', 'huirapuca-preintermedia', 'tucuman-rugby-club-preintermedia', 'universitario-de-tucuman-preintermedia', 'santiago-lawn-tennis-club-preintermedia', 'old-lions-r-c-preintermedia', 'santiago-rugby-club-preintermedia', 'tucuman-lawn-tennis-preintermedia', 'los-tarcos-m23', 'universitario-de-tucuman-m23', 'tucuman-lawn-tennis-m23', 'natacion-y-gimnasia-m23', 'tucuman-rugby-club-m23', 'huirapuca-m23', 'jockey-club-de-tucuman-m23', 'lince-rugby-club-m23');

COMMIT;
