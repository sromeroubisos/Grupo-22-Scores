-- DB diagnostics for Supabase instability, locks, and matches_feed_cache.
-- Run sections independently in Supabase SQL Editor while the app is under load.
-- These queries only read metadata/application tables, except the final commented
-- create extension statement.

-- A) Active queries and waits.
select
  pid,
  now() - query_start as duration,
  wait_event_type,
  wait_event,
  state,
  query
from pg_stat_activity
where state <> 'idle'
order by duration desc;

-- B) Blocked locks and blocking queries.
select
  blocked.pid as blocked_pid,
  blocked.query as blocked_query,
  blocking.pid as blocking_pid,
  blocking.query as blocking_query
from pg_stat_activity blocked
join pg_locks blocked_locks
  on blocked_locks.pid = blocked.pid
join pg_locks blocking_locks
  on blocking_locks.locktype = blocked_locks.locktype
 and blocking_locks.database is not distinct from blocked_locks.database
 and blocking_locks.relation is not distinct from blocked_locks.relation
 and blocking_locks.page is not distinct from blocked_locks.page
 and blocking_locks.tuple is not distinct from blocked_locks.tuple
 and blocking_locks.transactionid is not distinct from blocked_locks.transactionid
 and blocking_locks.classid is not distinct from blocked_locks.classid
 and blocking_locks.objid is not distinct from blocked_locks.objid
 and blocking_locks.objsubid is not distinct from blocked_locks.objsubid
 and blocking_locks.pid <> blocked_locks.pid
join pg_stat_activity blocking
  on blocking.pid = blocking_locks.pid
where not blocked_locks.granted
  and blocking_locks.granted;

-- C) Top queries by total execution time using pg_stat_statements.
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round(max_exec_time::numeric, 2) as max_ms,
  rows,
  left(query, 500) as query
from pg_stat_statements
order by total_exec_time desc
limit 30;

-- D) Slowest average queries.
select
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round(max_exec_time::numeric, 2) as max_ms,
  rows,
  left(query, 500) as query
from pg_stat_statements
where calls > 5
order by mean_exec_time desc
limit 30;

-- E) Most-called queries.
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  rows,
  left(query, 500) as query
from pg_stat_statements
order by calls desc
limit 30;

-- F) Size of matches_feed_cache.
select
  count(*) as total_rows,
  count(*) filter (where cache_key is not null) as rows_with_cache_key,
  pg_size_pretty(pg_total_relation_size('matches_feed_cache')) as total_size,
  pg_size_pretty(pg_relation_size('matches_feed_cache')) as table_size,
  pg_size_pretty(pg_indexes_size('matches_feed_cache')) as indexes_size
from matches_feed_cache;

-- G) Indexes on matches_feed_cache.
select
  indexname,
  indexdef
from pg_indexes
where tablename = 'matches_feed_cache'
order by indexname;

-- H) Row count by age, if created_at exists.
-- Note: current repo migrations define generated_at/updated_at, not created_at.
select
  date_trunc('hour', created_at) as hour,
  count(*) as rows
from matches_feed_cache
group by 1
order by 1 desc
limit 48;

-- H-alt) Row count by generated_at, compatible with current repo schema.
select
  date_trunc('hour', generated_at) as hour,
  count(*) as rows
from matches_feed_cache
group by 1
order by 1 desc
limit 48;

-- I) Count by expiration, if expires_at exists.
select
  count(*) as total,
  count(*) filter (where expires_at < now()) as expired,
  count(*) filter (where expires_at >= now()) as active
from matches_feed_cache;

-- J) Approximate bloat / vacuum stats.
select
  relname,
  n_live_tup,
  n_dead_tup,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
where relname = 'matches_feed_cache';

-- K) Check whether pg_stat_statements exists.
select *
from pg_extension
where extname = 'pg_stat_statements';

-- L) If pg_stat_statements does not exist, enable it from a privileged role.
-- create extension if not exists pg_stat_statements;
