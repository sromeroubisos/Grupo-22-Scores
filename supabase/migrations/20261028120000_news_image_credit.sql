-- Autor de la fotografía de portada de una noticia. Sale debajo de la foto.
-- Se corre a mano en Supabase (SQL Editor). Es idempotente.
-- Sin la columna, /api/news la descarta y el editor avisa (no rompe).

alter table public.news
    add column if not exists image_credit text;

comment on column public.news.image_credit is 'Autor de la foto de portada (image_url). Vacío = no se muestra.';
