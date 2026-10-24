-- Rollback de la fase "Playoffs" que se creó a mano en los torneos de URBA 2026
-- (Preintermedia A-F, Intermedia, Menores de 22 y Rugby Formativo, 10 torneos).
-- Las fases llevan settings.editor_source = 'urba_playoff_backfill'.
-- Devuelve las semifinales a la fase regular y borra lo creado. Una sola transacción.
begin;

create temp table _pf on commit drop as
  select id, tournament_id from tournament_phases
  where phase_type = 'playoff' and settings->>'editor_source' = 'urba_playoff_backfill';

-- las semifinales vuelven a la fase regular de su torneo
update matches m set
  phase_id = (select r.id from tournament_phases r
              where r.tournament_id = m.tournament_id and r.phase_type = 'league'
              order by r.order_index limit 1),
  round_uuid = null, group_id = null, bracket_match_code = null
where m.phase_id in (select id from _pf) and m.external_id is not null;

-- la final prevista (sin external_id) y las reglas de avance
delete from tournament_match_advancement_rules where phase_id in (select id from _pf);
delete from matches where phase_id in (select id from _pf) and external_id is null;

delete from tournament_rounds where phase_id in (select id from _pf);
delete from tournament_groups where phase_id in (select id from _pf);
delete from tournament_standings where phase_id in (select id from _pf);
delete from tournament_phases where id in (select id from _pf);

commit;
