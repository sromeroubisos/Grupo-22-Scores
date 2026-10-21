-- Rollback de la carga de los torneos 2026 de la Unión Cordobesa (cordoba-torneos).
-- Borra los torneos con todo lo que les cuelga y las fichas que creó la carga.
BEGIN;

-- torneo-cordobes-m16-a
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-a';

-- torneo-cordobes-m16-b
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m16-b';

-- torneo-cordobes-m17-b
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-b';

-- torneo-cordobes-m19-b
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m19-b';

-- torneo-cordobes-intermedia
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-intermedia';

-- torneo-cordobes-preintermedia-a
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-a';

-- torneo-cordobes-preintermedia-b
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-preintermedia-b';

-- torneo-cordobes-m17-a
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m17-a';

-- torneo-cordobes-m15-a
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-a';

-- torneo-cordobes-m15-b
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b');
DELETE FROM public.tournaments WHERE slug = 'torneo-cordobes-m15-b';

-- super-9-b-intermedia
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'super-9-b-intermedia');
DELETE FROM public.tournaments WHERE slug = 'super-9-b-intermedia';

-- regional-centro-b-intermedia
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia');
DELETE FROM public.tournaments WHERE slug = 'regional-centro-b-intermedia';

-- liga-desarrollo-capital-este
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este');
DELETE FROM public.tournaments WHERE slug = 'liga-desarrollo-capital-este';

-- liga-desarrollo-sur-centro
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro');
DELETE FROM public.tournaments WHERE slug = 'liga-desarrollo-sur-centro';

-- torneo-femenino-top-8
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-femenino-top-8');
DELETE FROM public.tournaments WHERE slug = 'torneo-femenino-top-8';

-- torneo-regional-del-centro-femenino
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino');
DELETE FROM public.tournaments WHERE slug = 'torneo-regional-del-centro-femenino';

-- ucr-juveniles-desarrollo-m2
DELETE FROM public.team_labels WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.tournament_standings WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.tournament_phase_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.team_season_entries WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.tournament_participants WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2'));
DELETE FROM public.tournament_phases WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
UPDATE public.tournaments SET current_season_id = NULL WHERE id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.tournament_seasons WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2');
DELETE FROM public.tournaments WHERE slug = 'ucr-juveniles-desarrollo-m2';

DELETE FROM public.club_derivatives WHERE derived_club_id IN ('tala-rugby-club-m16-a', 'cordoba-athletic-club-m16-a', 'club-palermo-bajo-m16-a', 'club-la-tablada-m16-a', 'jockey-club-de-villa-maria-m16-a', 'uru-cure-rugby-club-m16-a', 'carlos-paz-rugby-club-m16-a', 'san-martin-de-villa-maria-m16-a', 'jockey-club-cordoba-m16-a', 'club-universitario-de-cordoba-m16-a', 'tala-rugby-club-m16-b', 'cordoba-rugby-club-m16-b', 'los-cuervos-r-c-m16-b', 'club-la-tablada-m16-b', 'club-universitario-de-cordoba-m16-b', 'san-francisco-r-c-m16-b', 'club-la-tablada-m16-c', 'cordoba-athletic-club-m16-b', 'alta-gracia-r-c-m16-b', 'jockey-club-cordoba-m16-b', 'club-palermo-bajo-m16-b', 'tala-rugby-club-m16-c', 'baguales-r-c-m16-b', 'aero-club-rio-iv-m16-b', 'baguales-r-c-m17-b', 'uru-cure-rugby-club-m17-b', 'los-cuervos-r-c-m17-b', 'club-la-tablada-m17-b', 'club-universitario-de-cordoba-m17-b', 'san-francisco-r-c-m17-b', 'alta-gracia-r-c-m17-b', 'jockey-club-cordoba-m17-b', 'tala-rugby-club-m17-b', 'cordoba-rugby-club-m17-b', 'club-la-tablada-m17-c', 'cordoba-athletic-club-m17-b', 'club-palermo-bajo-m17-b', 'tala-rugby-club-m17-c', 'uru-cure-rugby-club-m19-b', 'tala-rugby-club-m19-c', 'tala-rugby-club-m19-b', 'club-la-tablada-m19-b', 'club-palermo-bajo-m19-b', 'jockey-club-cordoba-m19-b', 'cordoba-athletic-club-m19-c', 'jockey-club-cordoba-m19-c', 'cordoba-rugby-club-m19-b', 'club-la-tablada-m19-c', 'san-francisco-r-c-m19-b', 'cordoba-athletic-club-m19-d', 'cordoba-athletic-club-m19-b', 'club-universitario-de-cordoba-m19-b', 'alta-gracia-r-c-m19-b', 'jockey-club-cordoba-intermedia', 'san-martin-de-villa-maria-intermedia', 'jockey-club-de-villa-maria-intermedia', 'cordoba-athletic-club-intermedia', 'uru-cure-rugby-club-intermedia', 'carlos-paz-rugby-club-intermedia', 'club-palermo-bajo-intermedia', 'club-universitario-de-cordoba-intermedia', 'club-palermo-bajo-preintermedia-a', 'jockey-club-cordoba-preintermedia-a', 'cordoba-athletic-club-preintermedia-a', 'jockey-club-de-villa-maria-preintermedia-a', 'club-universitario-de-cordoba-preintermedia-a', 'uru-cure-rugby-club-preintermedia-a', 'san-martin-de-villa-maria-preintermedia-a', 'taborin-rc-preintermedia-b', 'universidad-nacional-de-cordoba-preintermedia-a', 'universidad-nacional-de-cordoba-preintermedia-b', 'jockey-club-cordoba-preintermedia-b', 'jockey-club-cordoba-preintermedia-c', 'club-universitario-de-cordoba-preintermedia-b', 'los-hurones-preintermedia-b', 'baguales-r-c-preintermedia-b', 'club-palermo-bajo-preintermedia-b', 'carlos-paz-rugby-club-preintermedia-b', 'cordoba-athletic-club-preintermedia-b', 'cordoba-athletic-club-preintermedia-c', 'club-la-tablada-preintermedia-c', 'club-la-tablada-m17-a', 'jockey-club-cordoba-m17-a', 'club-universitario-de-cordoba-m17-a', 'cordoba-athletic-club-m17-a', 'jockey-club-de-villa-maria-m17-a', 'san-martin-de-villa-maria-m17-a', 'club-palermo-bajo-m17-a', 'uru-cure-rugby-club-m17-a', 'tala-rugby-club-m17-a', 'carlos-paz-rugby-club-m17-a', 'uru-cure-rugby-club-m15-a', 'jockey-club-cordoba-m15-a', 'club-la-tablada-m15-a', 'club-universitario-de-cordoba-m15-a', 'cordoba-athletic-club-m15-a', 'tala-rugby-club-m15-a', 'carlos-paz-rugby-club-m15-a', 'club-palermo-bajo-m15-a', 'jockey-club-de-villa-maria-m15-a', 'san-martin-de-villa-maria-m15-a', 'tala-rugby-club-m15-b', 'cordoba-rugby-club-m15-b', 'baguales-r-c-m15-b', 'uru-cure-rugby-club-m15-b', 'club-la-tablada-m15-c', 'cordoba-athletic-club-m15-b', 'alta-gracia-r-c-m15-b', 'jockey-club-cordoba-m15-b', 'jockey-club-cordoba-m15-c', 'club-la-tablada-m15-b', 'club-universitario-de-cordoba-m15-b', 'san-francisco-r-c-m15-b', 'club-palermo-bajo-m15-b', 'tala-rugby-club-m15-c', 'baguales-r-c-intermedia', 'rio-tercero-r-c-intermedia', 'alta-gracia-r-c-intermedia', 'santa-rosa-r-c-c-intermedia', 'cordoba-rugby-club-intermedia', 'san-francisco-r-c-intermedia', 'los-cuervos-r-c-intermedia', 'c-s-la-carlota-intermedia', 'aero-club-rio-iv-intermedia', 'los-hurones-intermedia', 'los-chelcos-intermedia', 'club-social-la-rioja-intermedia', 'taborin-rc-femenino-verde', 'aero-club-rio-iv-femenino', 'manke-la-calera-femenino', 'los-chelcos-femenino');

DELETE FROM public.clubs WHERE id IN ('tala-rugby-club-m16-a', 'cordoba-athletic-club-m16-a', 'club-palermo-bajo-m16-a', 'club-la-tablada-m16-a', 'jockey-club-de-villa-maria-m16-a', 'uru-cure-rugby-club-m16-a', 'carlos-paz-rugby-club-m16-a', 'san-martin-de-villa-maria-m16-a', 'jockey-club-cordoba-m16-a', 'club-universitario-de-cordoba-m16-a', 'tala-rugby-club-m16-b', 'cordoba-rugby-club-m16-b', 'los-cuervos-r-c-m16-b', 'club-la-tablada-m16-b', 'club-universitario-de-cordoba-m16-b', 'san-francisco-r-c-m16-b', 'club-la-tablada-m16-c', 'cordoba-athletic-club-m16-b', 'alta-gracia-r-c-m16-b', 'jockey-club-cordoba-m16-b', 'club-palermo-bajo-m16-b', 'tala-rugby-club-m16-c', 'baguales-r-c-m16-b', 'aero-club-rio-iv-m16-b', 'baguales-r-c-m17-b', 'uru-cure-rugby-club-m17-b', 'los-cuervos-r-c-m17-b', 'club-la-tablada-m17-b', 'club-universitario-de-cordoba-m17-b', 'san-francisco-r-c-m17-b', 'alta-gracia-r-c-m17-b', 'jockey-club-cordoba-m17-b', 'tala-rugby-club-m17-b', 'cordoba-rugby-club-m17-b', 'club-la-tablada-m17-c', 'cordoba-athletic-club-m17-b', 'club-palermo-bajo-m17-b', 'tala-rugby-club-m17-c', 'uru-cure-rugby-club-m19-b', 'tala-rugby-club-m19-c', 'tala-rugby-club-m19-b', 'club-la-tablada-m19-b', 'club-palermo-bajo-m19-b', 'jockey-club-cordoba-m19-b', 'cordoba-athletic-club-m19-c', 'jockey-club-cordoba-m19-c', 'cordoba-rugby-club-m19-b', 'club-la-tablada-m19-c', 'san-francisco-r-c-m19-b', 'cordoba-athletic-club-m19-d', 'cordoba-athletic-club-m19-b', 'club-universitario-de-cordoba-m19-b', 'alta-gracia-r-c-m19-b', 'jockey-club-cordoba-intermedia', 'san-martin-de-villa-maria-intermedia', 'jockey-club-de-villa-maria-intermedia', 'cordoba-athletic-club-intermedia', 'uru-cure-rugby-club-intermedia', 'carlos-paz-rugby-club-intermedia', 'club-palermo-bajo-intermedia', 'club-universitario-de-cordoba-intermedia', 'club-palermo-bajo-preintermedia-a', 'jockey-club-cordoba-preintermedia-a', 'cordoba-athletic-club-preintermedia-a', 'jockey-club-de-villa-maria-preintermedia-a', 'club-universitario-de-cordoba-preintermedia-a', 'uru-cure-rugby-club-preintermedia-a', 'san-martin-de-villa-maria-preintermedia-a', 'taborin-rc-preintermedia-b', 'universidad-nacional-de-cordoba-preintermedia-a', 'universidad-nacional-de-cordoba-preintermedia-b', 'jockey-club-cordoba-preintermedia-b', 'jockey-club-cordoba-preintermedia-c', 'club-universitario-de-cordoba-preintermedia-b', 'los-hurones-preintermedia-b', 'baguales-r-c-preintermedia-b', 'club-palermo-bajo-preintermedia-b', 'carlos-paz-rugby-club-preintermedia-b', 'cordoba-athletic-club-preintermedia-b', 'cordoba-athletic-club-preintermedia-c', 'club-la-tablada-preintermedia-c', 'club-la-tablada-m17-a', 'jockey-club-cordoba-m17-a', 'club-universitario-de-cordoba-m17-a', 'cordoba-athletic-club-m17-a', 'jockey-club-de-villa-maria-m17-a', 'san-martin-de-villa-maria-m17-a', 'club-palermo-bajo-m17-a', 'uru-cure-rugby-club-m17-a', 'tala-rugby-club-m17-a', 'carlos-paz-rugby-club-m17-a', 'uru-cure-rugby-club-m15-a', 'jockey-club-cordoba-m15-a', 'club-la-tablada-m15-a', 'club-universitario-de-cordoba-m15-a', 'cordoba-athletic-club-m15-a', 'tala-rugby-club-m15-a', 'carlos-paz-rugby-club-m15-a', 'club-palermo-bajo-m15-a', 'jockey-club-de-villa-maria-m15-a', 'san-martin-de-villa-maria-m15-a', 'tala-rugby-club-m15-b', 'cordoba-rugby-club-m15-b', 'baguales-r-c-m15-b', 'uru-cure-rugby-club-m15-b', 'club-la-tablada-m15-c', 'cordoba-athletic-club-m15-b', 'alta-gracia-r-c-m15-b', 'jockey-club-cordoba-m15-b', 'jockey-club-cordoba-m15-c', 'club-la-tablada-m15-b', 'club-universitario-de-cordoba-m15-b', 'san-francisco-r-c-m15-b', 'club-palermo-bajo-m15-b', 'tala-rugby-club-m15-c', 'baguales-r-c-intermedia', 'rio-tercero-r-c-intermedia', 'alta-gracia-r-c-intermedia', 'santa-rosa-r-c-c-intermedia', 'cordoba-rugby-club-intermedia', 'san-francisco-r-c-intermedia', 'los-cuervos-r-c-intermedia', 'c-s-la-carlota-intermedia', 'aero-club-rio-iv-intermedia', 'los-hurones-intermedia', 'los-chelcos-intermedia', 'club-social-la-rioja-intermedia', 'rosedal-r-c', 'cuises-portena-rugby', 'universidad-siglo-21-rugby', 'asociacion-cordobesa-volantes', 'los-toros-de-brinkmann', 'ajedrez-cosquin-r-c', 'salsipuedes-r-c', 'villa-libertador-r-c', 'chelcos-de-villa-del-rosario', 'san-nicolas-rugby', 'manke-la-calera', 'aguilas-general-deheza', 'ranqueles-rugby', 'mackenna-r-c', 'las-iguanas-independiente-dolores', 'mirage-rugby-club', 'los-patriotas-ucacha', 'union-oncativo-rugby', 'universitario-villa-maria-rugby', 'los-tordos-hernando', 'nautico-fitz-simon', 'oliva-rugby-club', 'taborin-rc-femenino-verde', 'aero-club-rio-iv-femenino', 'manke-la-calera-femenino', 'los-chelcos-femenino', 'palermo-bajo-carlos-paz-femenino', 'cordoba-rc-la-tablada-femenino', 'combinado-capital', 'combinado-punilla', 'combinado-centro', 'buitres-san-basilio-mackenna-mirage', 'jockey-rio-iv-aguilas-adelia-maria', 'hurones-portena-oncativo');

COMMIT;
