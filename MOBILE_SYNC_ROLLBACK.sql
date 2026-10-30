-- Rollback de supabase/migrations/20260925120000_mobile_sync_v2.sql (app móvil G22 Gestión).
--
-- Después de correrlo, /api/mobile/v1/push responde 503 y la app vuelve sola al
-- camino directo (PATCH del Match Center). Nada de lo pendiente en los celulares
-- se pierde. NO toca datos de negocio: solo lo que agregó la migración.

do $$
declare
  t text;
begin
  foreach t in array array['matches', 'match_events', 'people', 'clubs', 'tournaments', 'tournament_participants', 'tournament_phases'] loop
    execute format('drop trigger if exists trg_mobile_sync_tombstone on public.%I', t);
  end loop;
end;
$$;

drop function if exists public.mobile_sync_record_tombstone();
drop trigger if exists trg_match_events_updated_at on public.match_events;
drop trigger if exists trg_tournament_phases_updated_at on public.tournament_phases;

drop index if exists public.matches_updated_at_idx;
drop index if exists public.match_events_updated_at_idx;
drop index if exists public.people_updated_at_idx;
drop index if exists public.clubs_updated_at_idx;
drop index if exists public.tournaments_updated_at_idx;
drop index if exists public.tournament_participants_updated_at_idx;
drop index if exists public.tournament_phases_updated_at_idx;
drop index if exists public.admin_audit_log_mobile_idx;

drop table if exists public.sync_tombstones;
drop table if exists public.mobile_sync_devices;
drop table if exists public.mobile_sync_mutations;
