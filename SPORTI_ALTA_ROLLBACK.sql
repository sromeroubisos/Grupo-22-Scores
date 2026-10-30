-- Rollback del alta de SporTI (CBRu 2026).
-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos y
-- los alias los referencian por FK.
BEGIN;

-- Super 12 – Primeira Divisão
DELETE FROM public.tournament_standings WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.matches WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.team_season_entries WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.tournament_participants WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff');
DELETE FROM public.tournament_phases WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.tournament_seasons WHERE tournament_id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';
DELETE FROM public.tournaments WHERE id = '0cb6bb8b-3c5b-4bab-9f1a-5fd7ddf281ff';

-- Super 12 – Segunda Divisão
DELETE FROM public.tournament_standings WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.matches WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.team_season_entries WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.tournament_participants WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a');
DELETE FROM public.tournament_phases WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';
DELETE FROM public.tournaments WHERE id = 'b1a38ea4-50e9-4bad-b056-75edaf9b279a';

-- Super 12 – Repescagem
DELETE FROM public.tournament_standings WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.matches WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.team_season_entries WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.tournament_participants WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f');
DELETE FROM public.tournament_phases WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.tournament_seasons WHERE tournament_id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';
DELETE FROM public.tournaments WHERE id = '70191ae2-9ddb-4405-abcc-534d1b7e122f';

-- Copa do Brasil de Rugby
DELETE FROM public.tournament_standings WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.matches WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.team_season_entries WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.tournament_participants WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c');
DELETE FROM public.tournament_phases WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.tournament_seasons WHERE tournament_id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';
DELETE FROM public.tournaments WHERE id = '1528e9be-5d88-4824-a8d5-2db30fb8bc0c';

-- Copa do Brasil Feminina de Rugby
DELETE FROM public.tournament_standings WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.matches WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.tournament_phase_participants WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.team_season_entries WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.tournament_participants WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0');
DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0');
DELETE FROM public.tournament_phases WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
UPDATE public.tournaments SET current_season_id = NULL WHERE id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.tournament_seasons WHERE tournament_id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';
DELETE FROM public.tournaments WHERE id = 'a6b6ea53-c913-40d1-8c6d-f423869420f0';

-- Alias de equipos creados por esta corrida
DELETE FROM public.club_external_ids WHERE provider = 'sporti' AND external_id IN ('equipe:farrapos-rugby-clube', 'equipe:charrua-rugby-clube', 'equipe:desterro-rugby-clube', 'equipe:joaca-rugby-clube', 'equipe:associacao-esportiva-politecnica-de-rugby', 'equipe:associacao-esportiva-rugby-clube-(sao-jose-rugby)', 'equipe:indaiatuba-rugby-clube', 'equipe:rio-branco-rugby-clube', 'equipe:associacao-esportiva-jacarei-rugby-1', 'equipe:sao-paulo-athletic-club', 'equipe:pasteur-athletique-club', 'equipe:nova-lima-rugby3', 'equipe:brummers-rugby-clube2', 'equipe:serra-gaucha-rugby-clube', 'equipe:uniao-de-rugby-tauras-carancho', 'equipe:pe-vermelho-rugby-clube', 'equipe:associacao-esportiva-engenharia-mackenzie', 'equipe:iguanas-rugby3', 'equipe:joinville-rugby-clube2', 'equipe:niteroi-rugby-football-clube', 'equipe:rio-rugby-football-club', 'equipe:carioca-rugby-football-club', 'equipe:urutu-rugby-clube', 'equipe:vitoria-rugby-club3', 'equipe:ceara-rugby3', 'equipe:porto-seguro-rugby-clube', 'equipe:rugby-sem-fronteiras', 'equipe:uniao-pernambucana-de-rugby', 'equipe:charrua-rugby-clube:feminino', 'equipe:jacroi:feminino', 'equipe:melina-rugby-clube:feminino', 'equipe:poli-usp:feminino');

-- Clubes creados por esta corrida
DELETE FROM public.clubs WHERE id IN ('farrapos-rugby', 'charrua-rugby-clube', 'desterro-rugby-clube', 'joaca-rugby-clube', 'poli-rugby', 'sao-jose-rugby', 'tornados-indaiatuba', 'rio-branco-rugby-clube', 'jacarei-rugby', 'sao-paulo-athletic-club', 'pasteur-athletique-club', 'nova-lima-rugby', 'brummers-rugby', 'serra-gaucha-rugby', 'colonos-rugby', 'pe-vermelho-rugby', 'leoes-de-paraisopolis', 'iguanas-rugby-sjc', 'joinville-rugby-clube', 'niteroi-rugby', 'rio-rugby', 'carioca-rugby', 'urutu-rugby', 'vitoria-rugby', 'siara-rugby', 'porto-seguro-rugby', 'rugby-sem-fronteiras', 'uniao-pernambucana-de-rugby', 'charrua-rugby-clube-femenino', 'jacroi-femenino', 'melina-rugby-femenino', 'poli-usp-femenino');

COMMIT;
