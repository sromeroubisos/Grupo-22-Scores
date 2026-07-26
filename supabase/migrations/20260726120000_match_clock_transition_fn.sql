-- Reloj de partido derivado: transicion ATOMICA anclada a now() del server.
--
-- Reemplaza el patron select clock -> resolver en JS -> update, que deja una
-- ventana de read-modify-write del tamano del PATCH entero (cientos de ms a
-- segundos cross-region). Con dos operadores esa ventana rompe de verdad: si A
-- manda START (ancla := T1) y B manda PAUSE habiendo leido el ancla vieja T0,
-- B calcula accumulated += now - T0 e inyecta todo el tiempo muerto. El reloj
-- salta minutos y nada lo detecta.
--
-- Aca la lectura y la escritura son una sola operacion, con FOR UPDATE sobre la
-- fila. Ademas resuelve el otro requisito de una: el ancla es now() de Postgres,
-- nunca Date.now() del navegador (la consola se usa desde el celular en la
-- cancha), y ahorra dos round-trips en una ruta que ya esta al limite.
--
-- SECURITY INVOKER a proposito (no DEFINER): asi sigue aplicando RLS sobre
-- matches. La ruta usa el service role, que la bypassea igual; si alguna vez cae
-- al cliente de usuario, el permiso lo decide RLS y no la funcion.

create or replace function public.match_clock_transition(
  p_match_id uuid,
  p_mode     text,
  p_period   text default null,
  p_seconds  integer default null,
  p_running  boolean default null
)
returns jsonb
language plpgsql
as $$
declare
  v_now         timestamptz := now();
  v_now_iso     text;
  v_clock       jsonb;
  v_started     timestamptz;
  v_accumulated integer;
  v_is_running  boolean;
  v_period      text;
  v_elapsed     integer;
  v_next        jsonb;
begin
  if p_mode is null or p_mode not in ('start', 'pause', 'set', 'keep') then
    raise exception 'match_clock_transition: modo invalido %', p_mode
      using errcode = '22023';
  end if;

  v_now_iso := to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select clock into v_clock
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_clock_transition: partido % inexistente', p_match_id
      using errcode = 'P0002';
  end if;

  v_clock := coalesce(v_clock, '{}'::jsonb);
  if jsonb_typeof(v_clock) <> 'object' then
    v_clock := '{}'::jsonb;
  end if;

  -- Lectura tolerante: modelo nuevo si esta, si no el espejo legacy. Una fila
  -- que nunca paso por el backfill se lee igual (queda pausada, sin perder el
  -- minuto ya cargado).
  if v_clock ? 'accumulated_seconds' then
    v_accumulated := greatest(0, coalesce(
      case when v_clock->>'accumulated_seconds' ~ '^[0-9]+$'
           then (v_clock->>'accumulated_seconds')::integer end, 0));

    begin
      v_started := nullif(v_clock->>'period_started_at', '')::timestamptz;
    exception when others then
      v_started := null;
    end;

    v_is_running := coalesce(
      case when v_clock->>'is_running' in ('true', 'false')
           then (v_clock->>'is_running')::boolean end, false)
      and v_started is not null;
  else
    v_accumulated := greatest(0,
      coalesce(case when v_clock->>'minute'  ~ '^[0-9]+$' then (v_clock->>'minute')::integer  end, 0) * 60 +
      coalesce(case when v_clock->>'seconds' ~ '^[0-9]+$' then (v_clock->>'seconds')::integer end, 0));
    v_started    := null;
    v_is_running := false;
  end if;

  v_period := coalesce(
    nullif(btrim(coalesce(p_period, '')), ''),
    nullif(btrim(coalesce(v_clock->>'period', '')), ''),
    '1T');

  if p_mode = 'start' then
    -- INICIAR / REANUDAR: ancla nueva, el acumulado no se toca.
    v_started    := v_now;
    v_is_running := true;

  elsif p_mode = 'pause' then
    -- El acumulado se calcula contra el ancla GUARDADA. p_seconds se ignora a
    -- proposito: el numero que manda el cliente no participa, asi el resultado
    -- es inmune a la deriva del reloj del dispositivo.
    v_accumulated := v_accumulated + case
      when v_is_running and v_started is not null
        then greatest(0, floor(extract(epoch from (v_now - v_started)))::integer)
      else 0
    end;
    v_started    := null;
    v_is_running := false;

  elsif p_mode = 'set' then
    -- Override manual (MIN/SEG) y rebase al arranque de un periodo.
    v_accumulated := greatest(0, coalesce(p_seconds, v_accumulated));
    v_is_running  := coalesce(p_running, v_is_running);
    v_started     := case when v_is_running then v_now else null end;

  end if; -- 'keep' solo re-rotula el periodo

  v_elapsed := v_accumulated + case
    when v_is_running and v_started is not null
      then greatest(0, floor(extract(epoch from (v_now - v_started)))::integer)
    else 0
  end;

  v_next := jsonb_build_object(
    -- modelo derivado: la fuente de verdad
    'period_started_at', case
      when v_started is null then null
      else to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    end,
    'accumulated_seconds', v_accumulated,
    'is_running', v_is_running,
    'period', v_period,
    'updated_at', v_now_iso,
    -- espejo legacy, CUMULATIVO: lo leen la ficha publica y ClubMatchWorkspace
    'minute', v_elapsed / 60,
    'seconds', v_elapsed % 60,
    'running', v_is_running,
    'syncedAt', v_now_iso
  );

  update public.matches
  set clock = v_next
  where id = p_match_id;

  return v_next;
end;
$$;

comment on function public.match_clock_transition(uuid, text, text, integer, boolean) is
  'Transicion atomica del reloj de partido. Modos: start | pause | set | keep. '
  'El ancla (period_started_at) y updated_at los estampa now() del server. '
  'En pause el acumulado se calcula contra el ancla guardada, ignorando p_seconds.';

revoke all on function public.match_clock_transition(uuid, text, text, integer, boolean) from public;
revoke all on function public.match_clock_transition(uuid, text, text, integer, boolean) from anon;
grant execute on function public.match_clock_transition(uuid, text, text, integer, boolean) to authenticated;
grant execute on function public.match_clock_transition(uuid, text, text, integer, boolean) to service_role;
