-- Las vistas de una noticia: un contador en la propia fila y una función
-- que lo suma de a uno, de forma atómica, solo en notas publicadas.
--
-- La función la llama /api/news/view con service_role. Nadie más tiene
-- permiso de ejecutarla: un cliente con la anon key no puede inflar el
-- contador a mano.
--
-- Se corre a mano en Supabase (SQL Editor). Es idempotente.

alter table public.news
    add column if not exists view_count integer not null default 0;

comment on column public.news.view_count is 'Vistas de la nota publicada (una por navegador cada 12 h). Lo suma /api/news/view.';

create or replace function public.increment_news_view(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
    update public.news
       set view_count = view_count + 1
     where id = p_id
       and status = 'published'
    returning view_count;
$$;

revoke all on function public.increment_news_view(uuid) from public, anon, authenticated;
grant execute on function public.increment_news_view(uuid) to service_role;
