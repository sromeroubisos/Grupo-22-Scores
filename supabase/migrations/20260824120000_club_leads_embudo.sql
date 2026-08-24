-- =============================================================================
-- club_leads — las columnas de la segunda puerta del embudo
-- =============================================================================
-- CORRER A MANO en el SQL Editor del Studio, como la migración original de
-- club_leads. Este repo tiene migraciones sin aplicar, así que dejar el archivo
-- no alcanza.
--
-- Mientras esta migración NO esté corrida, /api/leads/club-demo lo detecta
-- (PGRST204) y reintenta el insert SIN estas columnas: el lead entra igual,
-- sólo que sin el torneo ni las categorías. Nunca se pierde un lead por una
-- migración nuestra.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- =============================================================================

-- Por qué puerta entró: 'clubes' o 'torneos'. Es lo primero que mira quien
-- contesta, porque no se le responde lo mismo al que organiza un torneo que al
-- que representa un club.
alter table public.club_leads
    add column if not exists embudo text;

-- Sólo del embudo de clubes: en qué torneo juega. Se pregunta ABIERTO y no con
-- un select del catálogo, justamente porque el caso interesante es el club cuyo
-- torneo TODAVÍA NO está en G22. Esta columna es, leída en conjunto, la lista
-- de torneos a los que hay que ir a golpear la puerta.
alter table public.club_leads
    add column if not exists torneo text;

-- Sólo del embudo de clubes: qué categorías juegan. Reemplaza a `equipos`, que
-- es la medida del que organiza —un club tiene un equipo por categoría, así que
-- preguntarle cuántos maneja no dice nada.
alter table public.club_leads
    add column if not exists categorias text[];

-- `equipos` era NOT NULL cuando el formulario era uno solo. El lead de un club
-- no la contesta: pasa a admitir nulo. El endpoint escribe '' mientras esta
-- migración no esté corrida, así que las filas viejas y las nuevas conviven.
alter table public.club_leads
    alter column equipos drop not null;

-- Para leer los pedidos de una puerta sin barrer la tabla entera.
create index if not exists club_leads_embudo_idx
    on public.club_leads (embudo, created_at desc);

comment on column public.club_leads.embudo is
    'Puerta del embudo: clubes | torneos. Redundante con el prefijo de `origen`, pero indexable.';
comment on column public.club_leads.torneo is
    'Torneo en el que juega el club, escrito a mano. Puede no existir todavía en G22: esa es la gracia.';
comment on column public.club_leads.categorias is
    'Categorías que juegan: primera, intermedia, m19, m17, m16, femenino, infantiles.';
