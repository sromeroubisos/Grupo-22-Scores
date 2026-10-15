-- El autor de una noticia, como lo escribe quien la carga. Opcional: sin
-- autor, la nota se firma con la redacción del deporte (Salida 22, Córner
-- Corto o G22 Scores; ver src/lib/news/byline.ts).
--
-- `author_id` es el usuario que guardó la nota; esto es el nombre que se lee.
--
-- Se corre a mano en Supabase (SQL Editor). Es idempotente. Mientras falte,
-- /api/news sigue guardando el resto de la nota y el editor avisa que el
-- autor no se guardó.

alter table public.news
    add column if not exists author_name text;

comment on column public.news.author_name is 'Nombre del autor, opcional. Vacío = firma la redacción del deporte.';
