-- Córdoba 7 (2026): avance automático de la zona de copas.
-- YA APLICADO en producción el 2026-11-21 (por SQL directo); este archivo es el registro.
--
-- 1) Al quedar 'final' los 9 partidos de grupos, siembra los partidos M-10..M-13 con la tabla
--    general (mejores primeros/segundos/terceros de las tres zonas: puntos, diferencia, tantos a favor).
-- 2) Cuando un partido de la zona de copas queda 'final', ganador y perdedor pasan solos al
--    partido siguiente según tournament_match_advancement_rules.
-- Funciona venga el resultado de donde venga (gestor, script o carga directa).

create or replace function public.g22_cordoba7_avance() returns trigger language plpgsql as $fn$
declare
  t constant uuid := '65d4ace6-5df3-49cd-a59f-32a40777395e';
  gph uuid; cph uuid; pending int;
  p text[]; s text[]; th text[];
  r record; w text; cid text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  select id into gph from tournament_phases where tournament_id=t and phase_type<>'playoff' order by order_index limit 1;
  select id into cph from tournament_phases where tournament_id=t and phase_type='playoff' order by order_index limit 1;
  if gph is null or cph is null then return new; end if;

  select count(*) into pending from matches where tournament_id=t and phase_id=gph and status is distinct from 'final';
  if pending = 0 then
    with g as (
      select m.group_id, m.home_club_id hc, m.away_club_id ac,
             coalesce((m.score->>'home')::int,0) hs, coalesce((m.score->>'away')::int,0) aw,
             m.home_base_points + m.home_bonus_points hp, m.away_base_points + m.away_bonus_points ap
      from matches m where m.tournament_id=t and m.phase_id=gph),
    side as (
      select group_id, hc club, hs pf, aw pc, case when hp>0 then hp when hs>aw then 4 when hs=aw then 2 else 0 end pts from g
      union all
      select group_id, ac, aw, hs, case when ap>0 then ap when aw>hs then 4 when hs=aw then 2 else 0 end from g),
    tab as (select group_id, club, sum(pts) pts, sum(pf-pc) dif, sum(pf) pf from side group by 1,2),
    zr as (select *, row_number() over (partition by group_id order by pts desc, dif desc, pf desc, club) zpos from tab),
    gr as (select *, row_number() over (partition by zpos order by pts desc, dif desc, pf desc, club) rk from zr)
    select array_agg(club order by rk) filter (where zpos=1),
           array_agg(club order by rk) filter (where zpos=2),
           array_agg(club order by rk) filter (where zpos=3)
      into p, s, th from gr;

    if coalesce(array_length(p,1),0)=3 and coalesce(array_length(s,1),0)=3 and coalesce(array_length(th,1),0)=3 then
      for r in select * from (values ('M-10', s[2], th[1]), ('M-11', s[3], th[2]), ('M-12', p[1], s[1]), ('M-13', p[2], p[3])) v(code, hc, ac) loop
        update matches m set
          home_club_id = r.hc, away_club_id = r.ac,
          home_season_entry_id = (select season_entry_id from tournament_participants where tournament_id=t and club_id::text=r.hc limit 1),
          away_season_entry_id = (select season_entry_id from tournament_participants where tournament_id=t and club_id::text=r.ac limit 1),
          is_visible = true
        where m.tournament_id=t and m.phase_id=cph and m.bracket_match_code=r.code and m.status='scheduled';
      end loop;
      update tournament_phases set is_active=false where id=gph;
      update tournament_phases set is_active=true where id=cph;
    end if;
  end if;

  for r in
    select ru.outcome, ru.target_slot, ru.target_match_id, sm.home_club_id hc, sm.away_club_id ac, sm.score, sm.status
    from tournament_match_advancement_rules ru join matches sm on sm.id=ru.source_match_id
    where ru.phase_id=cph and sm.status='final'
  loop
    w := coalesce(r.score->>'winner',
           case when coalesce((r.score->>'home')::int,0) > coalesce((r.score->>'away')::int,0) then 'home'
                when coalesce((r.score->>'away')::int,0) > coalesce((r.score->>'home')::int,0) then 'away' end);
    continue when w not in ('home','away');
    cid := case when (r.outcome='winner') = (w='home') then r.hc else r.ac end;
    continue when cid is null;
    if r.target_slot='home' then
      update matches set home_club_id=cid,
        home_season_entry_id=(select season_entry_id from tournament_participants where tournament_id=t and club_id::text=cid limit 1)
      where id=r.target_match_id and status='scheduled';
    else
      update matches set away_club_id=cid,
        away_season_entry_id=(select season_entry_id from tournament_participants where tournament_id=t and club_id::text=cid limit 1)
      where id=r.target_match_id and status='scheduled';
    end if;
  end loop;

  update matches set is_visible=true where tournament_id=t and phase_id=cph and home_club_id is not null and away_club_id is not null and is_visible=false;
  return new;
end $fn$;

drop trigger if exists trg_g22_cordoba7_avance on public.matches;
create trigger trg_g22_cordoba7_avance after update of status, score on public.matches
for each row when (new.tournament_id = '65d4ace6-5df3-49cd-a59f-32a40777395e'::uuid)
execute function public.g22_cordoba7_avance();
