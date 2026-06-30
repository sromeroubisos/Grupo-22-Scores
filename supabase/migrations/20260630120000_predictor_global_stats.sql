-- Contadores GLOBALES del predictor de cuadros (social proof compartido por todos
-- los usuarios): cantidad de brackets exportadas + votos de campeón. El estado vive
-- en la DB para que el contador suba sin importar quién exporta (127, 128, 129...).

-- Contador genérico de la app (clave → valor). Lo usamos para "brackets exportadas".
create table if not exists public.app_counters (
    key text primary key,
    value bigint not null default 0,
    updated_at timestamptz not null default now()
);

-- Piso inicial pedido: arranca en 127.
insert into public.app_counters (key, value)
values ('predictor_brackets_exported', 127)
on conflict (key) do nothing;

-- Votos de campeón (cuántas veces se eligió cada selección al exportar un cuadro).
create table if not exists public.predictor_champion_votes (
    champion_key text primary key,
    name text not null,
    votes integer not null default 0,
    updated_at timestamptz not null default now()
);

-- Seeds iniciales pedidos.
insert into public.predictor_champion_votes (champion_key, name, votes) values
    ('argentina', 'Argentina', 40),
    ('espana', 'España', 36),
    ('francia', 'Francia', 30),
    ('portugal', 'Portugal', 20),
    ('brasil', 'Brasil', 1)
on conflict (champion_key) do nothing;

-- RLS activada SIN políticas: el acceso es solo vía service role (API server), nunca
-- escritura directa desde el browser. Las RPC son security definer.
alter table public.app_counters enable row level security;
alter table public.predictor_champion_votes enable row level security;

-- Incremento atómico del contador de exportes. Devuelve el nuevo valor.
create or replace function public.increment_predictor_export()
returns bigint
language sql
security definer
set search_path = public
as $$
    insert into public.app_counters (key, value)
    values ('predictor_brackets_exported', 128)
    on conflict (key) do update
        set value = public.app_counters.value + 1,
            updated_at = now()
    returning value;
$$;

-- Suma un voto de campeón (al exportar). Crea la fila si el equipo es nuevo.
create or replace function public.add_predictor_champion_vote(p_key text, p_name text)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.predictor_champion_votes (champion_key, name, votes)
    values (p_key, p_name, 1)
    on conflict (champion_key) do update
        set votes = public.predictor_champion_votes.votes + 1,
            name = excluded.name,
            updated_at = now();
$$;
