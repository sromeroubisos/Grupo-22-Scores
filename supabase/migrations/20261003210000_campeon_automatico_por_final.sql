-- Campeón automático: cuando termina la final de un torneo, la temporada registra
-- al ganador en `tournament_seasons.champion_club_id`.
--
-- Hasta ahora sólo lo escribían los importadores históricos: una final jugada en
-- vivo (Torneo del Interior "A" 2026, Tala 34-20 Jockey de Rosario) dejaba la
-- pestaña "Campeones" y el palmarés del club sin el título. Es el mismo enganche
-- que `trg_auto_complete_round`, que ya marca la ronda como completa.
--
-- Qué cuenta como LA final de la temporada (medido sobre la base el 2026-10-03:
-- acierta 245 de 247 temporadas que ya tenían campeón; las 2 restantes son
-- rarezas del archivo histórico y quedan protegidas por la regla de no pisar):
--   · ronda llamada "Final" o "Gran final", en una fase de tipo playoff/knockout;
--   · la fase no es una competencia secundaria (repechaje, por el puesto,
--     reválida, descenso, permanencia, plata, bronce, ascenso, clasificación, reubicación,
--     Apertura/Clausura...);
--   · la ronda tiene UN partido (no decide finales de ida y vuelta) y la
--     temporada tiene UNA sola final así (si hay dos, no adivina);
--   · el marcador tiene ganador (un empate no decide: lo resuelve una persona).
--
-- Nunca pisa un campeón cargado a mano o por un importador: sólo escribe si la
-- temporada no tiene campeón o si el que tiene lo puso esta misma regla (marca
-- `settings.champion_source = 'final_automatica'`), así una corrección del
-- marcador de la final corrige también el campeón.

create or replace function public.g22_campeon_por_final(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_h numeric;
  v_a numeric;
  v_ganador text;
  v_finales int;
  v_actual text;
  v_fuente text;
  c_excluir constant text :=
    '(repechaje|repechage|rev[aá]lida|puesto|descenso|permanencia|plata|bronce|reclasific|promoci|consuelo|ascenso|clasificaci|reubicaci|apertura|clausura)';
begin
  select m.id, m.season_id, m.status, m.home_club_id, m.away_club_id, m.score, m.round_uuid,
         r.name as ronda, p.phase_type, p.name as fase
    into v
    from public.matches m
    join public.tournament_rounds r on r.id = m.round_uuid
    join public.tournament_phases p on p.id = r.phase_id
   where m.id = p_match_id;

  if not found or v.status <> 'final' or v.season_id is null then return null; end if;
  if lower(trim(v.ronda)) not in ('final', 'gran final') then return null; end if;
  if v.phase_type not in ('playoff', 'knockout') then return null; end if;
  if v.fase ~* c_excluir then return null; end if;

  -- Partido único en la ronda.
  if (select count(*) from public.matches x
       where x.round_uuid = v.round_uuid and x.status <> 'postponed') <> 1 then
    return null;
  end if;

  -- Una sola final que califique en toda la temporada.
  select count(*) into v_finales
    from public.matches m2
    join public.tournament_rounds r2 on r2.id = m2.round_uuid
    join public.tournament_phases p2 on p2.id = r2.phase_id
   where m2.season_id = v.season_id
     and m2.status <> 'postponed'
     and lower(trim(r2.name)) in ('final', 'gran final')
     and p2.phase_type in ('playoff', 'knockout')
     and p2.name !~* c_excluir;
  if v_finales <> 1 then return null; end if;

  v_h := case when (v.score->>'home') ~ '^\d+(\.\d+)?$' then (v.score->>'home')::numeric end;
  v_a := case when (v.score->>'away') ~ '^\d+(\.\d+)?$' then (v.score->>'away')::numeric end;
  if v_h is null or v_a is null or v_h = v_a then return null; end if;
  v_ganador := case when v_h > v_a then v.home_club_id else v.away_club_id end;
  if v_ganador is null then return null; end if;

  select s.champion_club_id, s.settings->>'champion_source'
    into v_actual, v_fuente
    from public.tournament_seasons s
   where s.id = v.season_id
   for update;
  if not found then return null; end if;
  if v_actual is not null and coalesce(v_fuente, '') <> 'final_automatica' then return null; end if;
  if v_actual is not distinct from v_ganador then return v_ganador; end if;

  update public.tournament_seasons
     set champion_club_id = v_ganador,
         settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('champion_source', 'final_automatica',
                                          'champion_match_id', p_match_id::text)
   where id = v.season_id;

  return v_ganador;
end;
$$;

create or replace function public.g22_auto_campeon()
returns trigger
language plpgsql
as $$
begin
  perform public.g22_campeon_por_final(new.id);
  return new;
exception when others then
  -- Registrar el campeón nunca puede tumbar la carga de un resultado.
  raise warning 'g22_auto_campeon %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_g22_auto_campeon on public.matches;
create trigger trg_g22_auto_campeon
  after update on public.matches
  for each row
  when (new.status = 'final'
        and (old.status is distinct from new.status
             or old.score is distinct from new.score
             or old.round_uuid is distinct from new.round_uuid))
  execute function public.g22_auto_campeon();
