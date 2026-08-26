-- Las columnas de `news` que el código escribe y la base en vivo no tiene
-- (verificado el 2026-08-26: /api/news las descartaba en silencio, así que el
-- deporte y el alcance de las notas nunca se guardaron). Más las etiquetas
-- nuevas, que van a las palabras clave de la página (SEO), al Open Graph y a
-- la búsqueda de la portada.
--
-- Se corre a mano en Supabase (SQL Editor). Es idempotente. Mientras falte,
-- /api/news sigue guardando el resto de la nota y le avisa al editor qué
-- columnas descartó (`dropped`).

alter table public.news
    add column if not exists author_id uuid,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists sport text,
    add column if not exists scope text not null default 'global',
    add column if not exists scope_id text,
    add column if not exists tags text[] not null default '{}';

create index if not exists news_tags_gin on public.news using gin (tags);
create index if not exists news_sport_idx on public.news (sport);

comment on column public.news.sport is 'Id del deporte (rugby, field-hockey, football...) o una etiqueta propia.';
comment on column public.news.scope is 'global | tournament | club | union.';
comment on column public.news.tags is 'Etiquetas libres (SEO y búsqueda). Hasta 10, de hasta 30 caracteres.';
