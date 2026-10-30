
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('595de1d7-ad51-4390-be8a-e6e851ce1072'::uuid, '22382ed0-926e-44b4-b648-ae82268f0adb'::uuid),
('a3ee93c2-5800-4666-954c-a0a001179b0f'::uuid, '3cabf0cc-2889-4470-b212-96c411781651'::uuid),
('9d9d4d20-e1e2-4ffb-a45f-e8874719bc01'::uuid, 'b157c8f4-7985-441e-9085-23f0231a1ece'::uuid),
('025d7061-b721-4ff6-ac45-b30eeab3a22e'::uuid, 'a5133b13-d6a0-4328-9a25-e949d4768ea6'::uuid),
('45942520-b7af-42b4-8184-f3b2432e4236'::uuid, '5f4c06a8-eb0d-4a87-84be-56d989c32dc0'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('22382ed0-926e-44b4-b648-ae82268f0adb'::uuid, 'Ariel Francisco Olmedo Ramirez', 'Ariel Francisco', 'Olmedo Ramirez'),
('3cabf0cc-2889-4470-b212-96c411781651'::uuid, 'Matías Facundo Bianchi Altamira', 'Matías Facundo', 'Bianchi Altamira'),
('b157c8f4-7985-441e-9085-23f0231a1ece'::uuid, 'Mateo Francisco Frontera Croizet', 'Mateo Francisco', 'Frontera Croizet'),
('a5133b13-d6a0-4328-9a25-e949d4768ea6'::uuid, 'Franco Nahuel González Kogan', 'Franco Nahuel', 'González Kogan'),
('5f4c06a8-eb0d-4a87-84be-56d989c32dc0'::uuid, 'Ramiro Valdés Iribarren', 'Ramiro', 'Valdés Iribarren');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_j_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_j_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_j_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_j_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_j_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_j_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
  where (coalesce(t.attendance::text,'')||coalesce(t.players_snapshot::text,'')||coalesce(t.evaluation::text,'')) ~ rx.perdedoras;

-- reemplazo de ids embebidos (texto)
create or replace function pg_temp.swap(t text) returns text language plpgsql as $$
declare r record;
begin
  if t is null then return null; end if;
  for r in select loser, keep from fx loop
    if position(r.loser::text in t) > 0 then t := replace(t, r.loser::text, r.keep::text); end if;
  end loop;
  return t;
end $$;

update matches m set lineups = pg_temp.swap(lineups::text)::jsonb, events = pg_temp.swap(events::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_j_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_j_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_j_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_j_matches);
update match_events me set player_name = fn.full_name,
  details = case when me.details ? 'playerName' then me.details || jsonb_build_object('playerName', fn.full_name) else me.details end
  from fn where me.player_id = fn.keep;

-- roles y membresías
delete from club_person_roles r using fx
  where r.person_id = fx.loser and exists (select 1 from club_person_roles k where k.person_id = fx.keep
    and k.club_id = r.club_id and k.role = r.role and k.division_id is not distinct from r.division_id);
update club_person_roles r set person_id = fx.keep from fx where r.person_id = fx.loser;
update team_memberships t set person_id = fx.keep from fx where t.person_id = fx.loser;

update people p set full_name = fn.full_name, first_name = fn.first_name, last_name = fn.last_name from fn where p.id = fn.keep;
delete from people where id in (select loser from fx);

commit;
