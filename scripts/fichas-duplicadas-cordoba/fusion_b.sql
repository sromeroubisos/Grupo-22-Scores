
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
('c576c325-4645-48b6-bd2f-748eef1a030d'::uuid, '0fd15f3f-79f3-4603-8994-56f62d1adb03'::uuid),
('175650b2-738a-48d2-a6d3-0668a286a5ec'::uuid, 'b6b5b2eb-cb38-4238-bd49-a557ad3cc20c'::uuid),
('13d5f6ed-4393-4d4f-8e0a-75ad758a2754'::uuid, 'fbfd7700-84f6-41a0-920d-bb6deba0ea42'::uuid),
('d60f751e-10e4-4825-ae18-d1eb46b5b4d7'::uuid, 'ce6024e0-a524-4afe-a7fd-bfa65deaa980'::uuid),
('e6bd76bb-706a-40c6-919f-8e73609fc790'::uuid, 'e2f0d8a1-760e-448b-8599-0c1c760edba3'::uuid),
('17eaca97-1cb5-4306-aa2d-f9a036661ee6'::uuid, '2e3eda87-7fd4-4c0a-90ae-4e0e5734d72a'::uuid),
('4d7540d8-ba28-46d5-82ef-893c4f29e8b0'::uuid, '8bc97f7c-609a-4efe-9db0-aecab6727bbf'::uuid),
('f23595ba-fae7-48fe-9d75-882327730ece'::uuid, '14232d7b-d15c-42da-9aee-8bb6c151560c'::uuid),
('f38c8d4c-985b-424c-bf18-c59fd2d6c764'::uuid, '4d057034-5ae6-4efb-82ca-cb1042fa5916'::uuid),
('5775dce6-5817-489c-8984-5f7353da539c'::uuid, 'c56530cd-5c55-4c86-9331-54547e54cf45'::uuid),
('e07e1206-2d42-49e4-ac1a-f1826791b4e8'::uuid, '906e83b2-331b-4106-86a2-9d1b474181d0'::uuid),
('0f33f0c3-7810-4a79-9fbd-a6847be7fde8'::uuid, '3f6a8c86-982d-4557-8b53-688418118fb3'::uuid),
('e9730194-b07c-45f5-b2cd-e1bfe13522ce'::uuid, '2d2a56b1-6711-43ef-a77a-cb45119272b5'::uuid),
('aa6e51a5-d5aa-4ff8-b7b3-b4258fcba1bd'::uuid, 'd2978936-e5db-43de-8d2d-55543d87edba'::uuid),
('df60c539-65f3-49da-9208-f349d9ee7aee'::uuid, '8e026840-57bb-43e3-a242-442ec14b522f'::uuid),
('9efc2476-3393-49fe-98fe-0579d8536a6c'::uuid, '9653a1b0-c7da-4bbc-b601-1861b268fcf1'::uuid),
('881376ef-fb7f-4230-a542-154c4f99bc80'::uuid, '2ba7ba5f-bb6a-4e20-beac-f34f58e25ddc'::uuid),
('ef4203cd-5711-43ec-85cb-7fa65e9e3507'::uuid, '11afebe2-7b2e-4e92-8212-cebe1189ee2e'::uuid),
('1f94b669-c03e-4a4d-b22c-3615c02a8409'::uuid, '3e50243a-6f81-4231-a4d3-32a1a20b769d'::uuid),
('4619608f-a386-4644-925a-d00af17a44d6'::uuid, '5136684a-5135-48b2-9e4f-d4d7b27f0a81'::uuid),
('bab9711a-d5f0-4b0b-ae3f-75e8a1431cac'::uuid, 'db393ebf-4306-4c6a-9986-105fc78020d6'::uuid),
('5342c834-ca61-4444-aff8-196f5a36b5c7'::uuid, 'd7e2ab3d-54e8-40c9-9ad2-ba6ccceaf6ce'::uuid);

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
('0fd15f3f-79f3-4603-8994-56f62d1adb03'::uuid, 'Julian Sanchez', 'Julian', 'Sanchez'),
('b6b5b2eb-cb38-4238-bd49-a557ad3cc20c'::uuid, 'Joaquin Palacios', 'Joaquin', 'Palacios'),
('fbfd7700-84f6-41a0-920d-bb6deba0ea42'::uuid, 'Aldo César Martin Brane', 'Aldo César Martin', 'Brane'),
('ce6024e0-a524-4afe-a7fd-bfa65deaa980'::uuid, 'Jonathan Luciano Gomez', 'Jonathan Luciano', 'Gomez'),
('e2f0d8a1-760e-448b-8599-0c1c760edba3'::uuid, 'Dario Nahuel Fantino', 'Dario Nahuel', 'Fantino'),
('2e3eda87-7fd4-4c0a-90ae-4e0e5734d72a'::uuid, 'Martin Gaston Escalera', 'Martin Gaston', 'Escalera'),
('8bc97f7c-609a-4efe-9db0-aecab6727bbf'::uuid, 'Ignacio Pérez Soria', 'Ignacio Pérez', 'Soria'),
('14232d7b-d15c-42da-9aee-8bb6c151560c'::uuid, 'Ignacio Gabriel Farías Decarlini', 'Ignacio Gabriel Farías', 'Decarlini'),
('4d057034-5ae6-4efb-82ca-cb1042fa5916'::uuid, 'Francisco Susperregui', 'Francisco', 'Susperregui'),
('c56530cd-5c55-4c86-9331-54547e54cf45'::uuid, 'Joaquin Zamorano', 'Joaquin', 'Zamorano'),
('906e83b2-331b-4106-86a2-9d1b474181d0'::uuid, 'Ricardo Francisco Gauna Martin', 'Ricardo Francisco', 'Gauna Martin'),
('3f6a8c86-982d-4557-8b53-688418118fb3'::uuid, 'Ramiro Valdés Iribarren', 'Ramiro', 'Valdés Iribarren'),
('2d2a56b1-6711-43ef-a77a-cb45119272b5'::uuid, 'Ignacio Flores', 'Ignacio', 'Flores'),
('d2978936-e5db-43de-8d2d-55543d87edba'::uuid, 'Estanislao Gomez Fernandez', 'Estanislao Gomez', 'Fernandez'),
('8e026840-57bb-43e3-a242-442ec14b522f'::uuid, 'Joaquin Correa Garnier', 'Joaquin Correa', 'Garnier'),
('9653a1b0-c7da-4bbc-b601-1861b268fcf1'::uuid, 'Valentin Fernandez', 'Valentin', 'Fernandez'),
('2ba7ba5f-bb6a-4e20-beac-f34f58e25ddc'::uuid, 'Ignacio Gil', 'Ignacio', 'Gil'),
('11afebe2-7b2e-4e92-8212-cebe1189ee2e'::uuid, 'Ignacio Romero', 'Ignacio', 'Romero'),
('3e50243a-6f81-4231-a4d3-32a1a20b769d'::uuid, 'Isaias Such', 'Isaias', 'Such'),
('5136684a-5135-48b2-9e4f-d4d7b27f0a81'::uuid, 'Nicolás Ezequiel Sánchez Gómez', 'Nicolás Ezequiel', 'Sánchez Gómez'),
('db393ebf-4306-4c6a-9986-105fc78020d6'::uuid, 'Ignacio Gandini', 'Ignacio', 'Gandini'),
('d7e2ab3d-54e8-40c9-9ad2-ba6ccceaf6ce'::uuid, 'Tomas Francisco Maiztegui', 'Tomas Francisco', 'Maiztegui');

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023_b_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023_b_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023_b_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023_b_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023_b_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023_b_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
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
  where id in (select id from bak_fusion_cba_20261023_b_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_b_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023_b_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023_b_matches);
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
