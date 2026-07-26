-- Backfill del reloj legacy al modelo derivado.
--
-- legacy -> accumulated_seconds = minute*60 + seconds
--           is_running = false
--           period_started_at = null
--
-- Nadie pierde el minuto ya cargado, y todos quedan PAUSADOS: sin ancla no hay
-- forma de saber cuanto corrio desde el ultimo snapshot, y arrancar corriendo
-- desde una ancla inventada sumaria tiempo que nunca paso. El operador aprieta
-- REANUDAR y sigue.
--
-- Idempotente: solo toca filas que todavia no tienen accumulated_seconds.
-- Se puede correr dos veces sin efecto.
--
-- Notas de seguridad de datos:
--  * el espejo legacy (minute/seconds/running/syncedAt) se conserva dentro del
--    mismo objeto, asi la ficha publica y ClubMatchWorkspace no ven un cambio;
--  * los partidos sin clock (null) no se tocan: normalizeStoredClock los lee
--    como reloj vacio;
--  * el caso raro de "solo segundos totales" (seconds >= 60 sin minute) sale
--    correcto con la misma suma, porque minute aporta 0.

begin;

with legacy as (
  select
    id,
    coalesce(nullif(btrim(clock->>'period'), ''), '1T') as period,
    nullif(btrim(coalesce(clock->>'syncedAt', '')), '') as synced_at,
    greatest(0,
      coalesce(case when clock->>'minute'  ~ '^[0-9]+$' then (clock->>'minute')::integer  end, 0) * 60 +
      coalesce(case when clock->>'seconds' ~ '^[0-9]+$' then (clock->>'seconds')::integer end, 0)
    ) as total
  from public.matches
  where clock is not null
    and jsonb_typeof(clock) = 'object'
    and not (clock ? 'accumulated_seconds')
)
update public.matches m
set clock = jsonb_build_object(
  'period_started_at',   null,
  'accumulated_seconds', l.total,
  'is_running',          false,
  'period',              l.period,
  'updated_at',          null,
  'minute',              l.total / 60,
  'seconds',             l.total % 60,
  'running',             false,
  'syncedAt',            l.synced_at
)
from legacy l
where m.id = l.id;

commit;

-- Verificacion (correr a mano despues del backfill):
--
--   select
--     count(*) filter (where clock is null)                          as sin_reloj,
--     count(*) filter (where clock ? 'accumulated_seconds')          as migrados,
--     count(*) filter (where clock is not null
--                        and not (clock ? 'accumulated_seconds'))    as pendientes,
--     count(*) filter (where (clock->>'is_running')::boolean)        as corriendo
--   from public.matches;
--
-- `pendientes` tiene que dar 0 y `corriendo` tiene que dar 0.
