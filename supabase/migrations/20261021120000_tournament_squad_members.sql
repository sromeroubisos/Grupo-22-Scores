-- Tabla de Planteles: qué torneos/categorías suman en una misma clasificación.
--
-- Una agrupación es un `group_key` (texto libre, ej. 'regional-centro'); cada
-- fila vincula un torneo a la agrupación. Cada torneo vinculado muestra la
-- pestaña "Tabla de Planteles" con la suma de los puntos de TODOS los de su
-- agrupación. No duplica clubes ni resultados: lee las tablas existentes.
--
-- Se corre a mano en Supabase (SQL Editor). Es idempotente.

create table if not exists public.tournament_squad_members (
    group_key     text not null,
    tournament_id uuid not null references public.tournaments(id) on delete cascade,
    group_name    text not null,
    label         text,
    weight        numeric not null default 1 check (weight >= 0),
    sort_order    integer not null default 0,
    created_at    timestamptz not null default now(),
    primary key (group_key, tournament_id)
);

create index if not exists tournament_squad_members_tournament_idx
    on public.tournament_squad_members (tournament_id);

alter table public.tournament_squad_members enable row level security;

-- Lectura pública (la agrupación es metadata); escritura solo service_role.
drop policy if exists tournament_squad_members_read on public.tournament_squad_members;
create policy tournament_squad_members_read on public.tournament_squad_members
    for select using (true);

comment on table public.tournament_squad_members is 'Agrupación de torneos para la Tabla de Planteles (suma de puntos por club).';
