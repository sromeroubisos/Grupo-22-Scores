-- Busqueda de partidos en la consola del superadmin.
--
-- `matches` no guarda el nombre del torneo ni el de los clubes, solo sus ids. Sin
-- esta vista, buscar por nombre obliga a resolver ids en una consulta aparte y
-- mandarlos dentro de la query string: con un termino amplio la lista se va a miles
-- de ids, PostgREST devuelve la query entera en `Content-Location` y la respuesta se
-- cae por headers desbordados. El endpoint la acota y avisa, pero acotada quiere
-- decir que la busqueda no llega a todos los partidos.
--
-- Con la vista, buscar es un `ilike` sobre una sola columna y alcanza al historial
-- completo (~55k partidos), sin techo y sin aviso que dar.
--
-- `security_invoker = true`: la vista no puede ser una puerta que saltee el RLS de
-- `matches`; cada quien la lee con sus propios permisos.

drop view if exists public.admin_matches_search;

create view public.admin_matches_search
with (security_invoker = true) as
select
    m.*,
    lower(
        concat_ws(
            ' ',
            t.name,
            hc.name,
            ac.name,
            m.venue,
            m.home_source_label,
            m.away_source_label
        )
    ) as search_text
from public.matches m
left join public.tournaments t on t.id = m.tournament_id
left join public.clubs hc on hc.id = m.home_club_id
left join public.clubs ac on ac.id = m.away_club_id;

comment on view public.admin_matches_search is
    'matches + nombre de torneo y clubes en `search_text`, para la busqueda de /admin/super/partidos.';

grant select on public.admin_matches_search to authenticated, service_role;
