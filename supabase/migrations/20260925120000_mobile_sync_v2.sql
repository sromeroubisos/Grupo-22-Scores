-- Sincronización de la app móvil G22 Gestión (offline-first) — v2.
--
-- Reemplaza a 20260914120000_mobile_sync_mutations.sql, que nunca se aplicó.
-- SE CORRE A MANO (o con apply_migration) y es idempotente: se puede correr dos
-- veces sin romper nada. Rollback: MOBILE_SYNC_ROLLBACK.sql en la raíz.
--
-- Qué agrega:
-- 1. `mobile_sync_mutations`: registro de cada modificación que sube un celular
--    (su `mutation_id` UUID). La puerta /api/mobile/v1/push la RECLAMA antes de
--    aplicarla: un reintento encuentra la fila `applied` y responde "duplicado"
--    sin volver a escribir. También es la fuente de las métricas (latencia,
--    reintentos, fallas por dispositivo).
-- 2. `mobile_sync_devices`: último estado informado por cada celular (pendientes,
--    fallas, conflictos, último error). Detecta cuellos de botella por dispositivo.
-- 3. `sync_tombstones`: qué se BORRÓ y cuándo, para que la descarga incremental
--    pueda avisar los borrados (sin esto, un celular nunca se entera de que un
--    evento se borró desde la web).
-- 4. `updated_at` al día en `match_events` y `tournament_phases` (tenían la
--    columna pero ningún trigger) e índices por `updated_at`: la descarga
--    incremental pregunta "qué cambió desde X" sin recorrer 130 mil partidos.
-- 5. Índice para el tablero de actividad móvil en `admin_audit_log`.
--
-- Todas las tablas nuevas: RLS activado y SIN policies. Solo las usa la puerta
-- con service_role; ni `anon` ni `authenticated` las leen ni escriben.

-- ─── 1. Registro de modificaciones ──────────────────────────────────────────
create table if not exists public.mobile_sync_mutations (
  mutation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  entity text not null check (entity in ('tournaments', 'tournament_phases', 'clubs', 'tournament_participants', 'people', 'matches', 'match_events')),
  op text not null check (op in ('insert', 'update', 'delete')),
  record_id text not null,
  server_record_id text,
  -- processing: tomada por un envío en curso · applied: escrita (definitivo) ·
  -- released: falló, conflicto o rechazo; el MISMO mutation_id se puede reintentar.
  status text not null check (status in ('processing', 'applied', 'released')),
  result jsonb,
  result_status text,
  error text,
  attempts integer not null default 0,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer
);

create index if not exists mobile_sync_mutations_user_created_idx on public.mobile_sync_mutations (user_id, created_at desc);
create index if not exists mobile_sync_mutations_finished_idx on public.mobile_sync_mutations (finished_at desc);
create index if not exists mobile_sync_mutations_processing_idx on public.mobile_sync_mutations (updated_at) where status = 'processing';

alter table public.mobile_sync_mutations enable row level security;
revoke all on table public.mobile_sync_mutations from anon, authenticated;
comment on table public.mobile_sync_mutations is
  'App móvil G22 Gestión: una fila por modificación (mutation_id). Idempotencia y métricas. Solo service_role.';

-- ─── 2. Dispositivos ────────────────────────────────────────────────────────
create table if not exists public.mobile_sync_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  platform text,
  app_version text,
  pending integer not null default 0,
  failed integer not null default 0,
  conflicts integer not null default 0,
  last_error text,
  last_sync_at timestamptz,
  last_push_ms integer,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists mobile_sync_devices_seen_idx on public.mobile_sync_devices (last_seen_at desc);

alter table public.mobile_sync_devices enable row level security;
revoke all on table public.mobile_sync_devices from anon, authenticated;
comment on table public.mobile_sync_devices is
  'App móvil G22 Gestión: último estado informado por cada celular. Solo service_role.';

-- ─── 3. Borrados (para la descarga incremental) ─────────────────────────────
create table if not exists public.sync_tombstones (
  id bigint generated always as identity primary key,
  entity text not null,
  record_id text not null,
  match_id text,
  tournament_id text,
  club_id text,
  deleted_at timestamptz not null default now()
);

create index if not exists sync_tombstones_deleted_idx on public.sync_tombstones (deleted_at);

alter table public.sync_tombstones enable row level security;
revoke all on table public.sync_tombstones from anon, authenticated;
comment on table public.sync_tombstones is
  'Filas borradas de las tablas que baja la app móvil (descarga incremental). Se purgan a los 30 días. Solo service_role.';

create or replace function public.mobile_sync_record_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := to_jsonb(OLD);
begin
  insert into public.sync_tombstones (entity, record_id, match_id, tournament_id, club_id)
  values (TG_TABLE_NAME, old_row ->> 'id', old_row ->> 'match_id', old_row ->> 'tournament_id', old_row ->> 'club_id');
  return OLD;
end;
$$;

revoke all on function public.mobile_sync_record_tombstone() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['matches', 'match_events', 'people', 'clubs', 'tournaments', 'tournament_participants', 'tournament_phases'] loop
    execute format('drop trigger if exists trg_mobile_sync_tombstone on public.%I', t);
    execute format('create trigger trg_mobile_sync_tombstone after delete on public.%I for each row execute function public.mobile_sync_record_tombstone()', t);
  end loop;
end;
$$;

-- ─── 4. updated_at al día + índices para "qué cambió desde X" ──────────────
drop trigger if exists trg_match_events_updated_at on public.match_events;
create trigger trg_match_events_updated_at before update on public.match_events
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_tournament_phases_updated_at on public.tournament_phases;
create trigger trg_tournament_phases_updated_at before update on public.tournament_phases
  for each row execute function public.update_updated_at_column();

create index if not exists matches_updated_at_idx on public.matches (updated_at);
create index if not exists match_events_updated_at_idx on public.match_events (updated_at);
create index if not exists people_updated_at_idx on public.people (updated_at);
create index if not exists clubs_updated_at_idx on public.clubs (updated_at);
create index if not exists tournaments_updated_at_idx on public.tournaments (updated_at);
create index if not exists tournament_participants_updated_at_idx on public.tournament_participants (updated_at);
create index if not exists tournament_phases_updated_at_idx on public.tournament_phases (updated_at);

-- ─── 5. Actividad móvil (auditoría) ─────────────────────────────────────────
-- La puerta audita con entity_type = 'matches' y entity_id = id del partido,
-- también para sus eventos: el índice existente (entity_type, entity_id,
-- created_at) ya sirve para el historial de un partido.
create index if not exists admin_audit_log_mobile_idx on public.admin_audit_log (created_at desc) where source = 'mobile';
