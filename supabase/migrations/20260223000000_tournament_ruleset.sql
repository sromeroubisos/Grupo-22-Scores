-- Add ruleset (customizable scoring rules) to tournaments
alter table public.tournaments
  add column if not exists ruleset jsonb not null default '{}'::jsonb,
  add column if not exists ruleset_version int not null default 1;

-- Version history table for ruleset snapshots (audit / rollback)
create table if not exists public.tournament_rulesets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  version int not null,
  ruleset jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null,
  note text null,
  unique (tournament_id, version)
);

create index if not exists idx_tournament_rulesets_tournament
  on public.tournament_rulesets(tournament_id, version desc);

alter table public.tournament_rulesets enable row level security;

create policy "super_admin_manage_rulesets"
  on public.tournament_rulesets
  for all
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  )
  with check (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );
