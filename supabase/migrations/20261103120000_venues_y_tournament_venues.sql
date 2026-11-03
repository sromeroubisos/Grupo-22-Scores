-- Sedes con canchas, compartidas entre torneos.
--
-- Una sede ("Olivos") tiene N canchas que se usan al mismo tiempo. Varios
-- torneos pueden jugarse en la misma sede el mismo día (el Seven de Olivos son
-- tres torneos: Mayores, M19 y Gordos): el generador de fixture los intercala
-- y ningún partido pisa a otro en la misma cancha.
--
-- No es `club_venues`: esa tabla exige un club, y una sede puede no ser de
-- ninguno (una cancha municipal, un predio de la unión).
--
-- Las canchas de un partido se guardan como texto en `matches.venue`
-- ("Olivos · Cancha 2"), igual que antes: esta tabla dice cuántas hay, no
-- reemplaza esa columna.
--
-- Se corre a mano en Supabase (SQL Editor). Es idempotente.

create table if not exists public.venues (
    id            uuid primary key default gen_random_uuid(),
    name          text not null check (length(btrim(name)) > 0),
    fields_count  integer not null default 1 check (fields_count between 1 and 50),
    city          text,
    address       text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create unique index if not exists venues_name_lower_idx on public.venues (lower(btrim(name)));

create table if not exists public.tournament_venues (
    tournament_id uuid not null references public.tournaments(id) on delete cascade,
    venue_id      uuid not null references public.venues(id) on delete cascade,
    created_at    timestamptz not null default now(),
    primary key (tournament_id, venue_id)
);

create index if not exists tournament_venues_venue_idx on public.tournament_venues (venue_id);

alter table public.venues enable row level security;
alter table public.tournament_venues enable row level security;

-- Lectura pública (es metadata del fixture); escritura solo service_role.
drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues for select using (true);

drop policy if exists tournament_venues_read on public.tournament_venues;
create policy tournament_venues_read on public.tournament_venues for select using (true);

comment on table public.venues is 'Sedes con su cantidad de canchas; las comparten varios torneos.';
comment on table public.tournament_venues is 'Qué torneos se juegan en qué sede.';
