-- Replace hot-path full cache invalidation with bounded expired-row cleanup.
-- The app calls this RPC instead of deleting every row in matches_feed_cache.
-- Advisory lock prevents concurrent cleanups across server instances.

create or replace function public.delete_expired_matches_feed_cache(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('matches_feed_cache_cleanup')) then
    return 0;
  end if;

  with doomed as (
    select cache_key
    from public.matches_feed_cache
    where coalesce(stale_until, expires_at) < now()
    order by coalesce(stale_until, expires_at)
    limit greatest(1, least(p_limit, 5000))
  ),
  deleted as (
    delete from public.matches_feed_cache m
    using doomed
    where m.cache_key = doomed.cache_key
    returning 1
  )
  select count(*) into v_count from deleted;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.delete_expired_matches_feed_cache(integer) to service_role;

drop function if exists public.delete_matches_feed_cache_for_scope(date, timestamptz, text, integer);
drop function if exists public.delete_matches_feed_cache_for_scope(date, timestamptz, text, text, integer);

create or replace function public.delete_matches_feed_cache_for_scope(
  p_effective_date date default null,
  p_date_time timestamptz default null,
  p_sport text default null,
  p_status_filter text default null,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_sport text := nullif(lower(btrim(p_sport)), '');
  v_status_filter text := nullif(lower(btrim(p_status_filter)), '');
begin
  if p_effective_date is null and p_date_time is null then
    return 0;
  end if;

  if not pg_try_advisory_xact_lock(
    hashtext(
      'matches_feed_cache_scope:' ||
      coalesce(p_effective_date::text, p_date_time::text, 'none') ||
      ':' ||
      coalesce(v_sport, '*') ||
      ':' ||
      coalesce(v_status_filter, '*')
    )
  ) then
    return 0;
  end if;

  with doomed as (
    select cache_key
    from public.matches_feed_cache
    where feed_type = 'daily'
      and (
        (p_effective_date is not null and effective_date = p_effective_date)
        or (
          p_date_time is not null
          and effective_date = ((p_date_time at time zone coalesce(nullif(time_zone, ''), 'UTC'))::date)
        )
      )
      and (
        v_sport is null
        or sport is null
        or lower(sport) = v_sport
      )
      and (
        v_status_filter is null
        or status_filter is null
        or lower(status_filter) = v_status_filter
      )
    order by generated_at nulls first, cache_key
    limit greatest(1, least(p_limit, 5000))
  ),
  deleted as (
    delete from public.matches_feed_cache m
    using doomed
    where m.cache_key = doomed.cache_key
    returning 1
  )
  select count(*) into v_count from deleted;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.delete_matches_feed_cache_for_scope(date, timestamptz, text, text, integer) to service_role;

create or replace function public.delete_expired_tournaments_feed_cache(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('tournaments_feed_cache_cleanup')) then
    return 0;
  end if;

  with doomed as (
    select cache_key
    from public.tournaments_feed_cache
    where coalesce(stale_until, expires_at) < now()
    order by coalesce(stale_until, expires_at)
    limit greatest(1, least(p_limit, 5000))
  ),
  deleted as (
    delete from public.tournaments_feed_cache t
    using doomed
    where t.cache_key = doomed.cache_key
    returning 1
  )
  select count(*) into v_count from deleted;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.delete_expired_tournaments_feed_cache(integer) to service_role;
