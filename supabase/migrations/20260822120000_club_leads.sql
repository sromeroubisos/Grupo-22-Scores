-- =============================================================================
-- club_leads — pedidos de demo de "G22 para clubes"
-- =============================================================================
-- CORRER A MANO en el SQL Editor del Studio. Este repo tiene migraciones sin
-- aplicar, así que dejar el archivo no alcanza: hasta que esta tabla exista, el
-- endpoint /api/leads/club-demo acepta el lead igual y lo deja en el log del
-- servidor (nunca lo pierde), pero no hay dónde consultarlo después.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- =============================================================================

create table if not exists public.club_leads (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),

    nombre text not null,
    organizacion text not null,
    rol text not null,
    telefono text not null,
    email text,
    equipos text not null,
    mensaje text,

    -- Atribución: de qué ubicación de la promo salió el click, y de qué página
    -- venía. Es lo que permite decidir si la barra inferior se queda o se va.
    origen text,
    referrer text,
    user_agent text,

    -- Seguimiento comercial. El endpoint no lo escribe: lo mueve una persona.
    estado text not null default 'nuevo',
    notas text
);

-- La IP NO se guarda a propósito: se usa para el rate limit y ahí termina.

create index if not exists club_leads_created_at_idx
    on public.club_leads (created_at desc);

create index if not exists club_leads_estado_idx
    on public.club_leads (estado)
    where estado <> 'cerrado';

-- -----------------------------------------------------------------------------
-- RLS: nadie entra por PostgREST.
-- -----------------------------------------------------------------------------
-- La tabla la escribe el endpoint con la service key, que salta RLS por diseño.
-- Sin políticas y con RLS prendido, el anónimo y el usuario logueado no pueden
-- leer ni escribir un solo renglón. Es lo que corresponde: acá hay teléfonos y
-- emails de dirigentes, y no existe ninguna pantalla del sitio público que
-- necesite verlos.
alter table public.club_leads enable row level security;

comment on table public.club_leads is
    'Pedidos de demo del embudo /para-clubes. Escritos por la service key desde /api/leads/club-demo. Sin políticas RLS: no se consultan desde el cliente.';
