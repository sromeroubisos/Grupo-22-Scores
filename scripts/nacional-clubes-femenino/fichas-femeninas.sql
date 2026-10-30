-- Nacional de Clubes Femenino: cada equipo pasa del club madre (el de los
-- varones) a su ficha femenina, colgada del club madre en club_derivatives.
--   Mayores   (4baab70e…, 2011-2026): <club> -> "<Club> Femenino"      (women)
--   Juveniles (09995687…):            <club> -> "<Club> Femenino M18"  (youth, de la femenina)
-- Se reusan las femeninas que ya existían (ciudad-femenino, la-plata-femenino,
-- sitas-, centro-naval-, casa-de-padua-femenino). Sirenas SMATA y Granaderas /
-- Red Star ya son equipos femeninos por nombre y no se tocan.
-- Deshacer: fichas-femeninas-rollback.sql (misma tabla de equivalencias).

begin;

create temp table mapa (t text, base text, fem_id text, fem_estado text, destino text, tid text);
insert into mapa (t, base, fem_id, fem_estado, destino) values
('JUV','aguara-rc-jardin-america','aguara-rc-jardin-america-femenino','nuevo','aguara-rc-jardin-america-femenino-m18'),
('JUV','baguales-r-c','baguales-r-c-femenino','nuevo','baguales-r-c-femenino-m18'),
('JUV','bajo-hondo','bajo-hondo-femenino','nuevo','bajo-hondo-femenino-m18'),
('JUV','capri','capri-femenino','nuevo','capri-femenino-m18'),
('JUV','cardenales-r-c','cardenales-r-c-femenino','nuevo','cardenales-r-c-femenino-m18'),
('JUV','ciudad-de-buenos-aires','ciudad-femenino','existe','ciudad-femenino-m18'),
('JUV','club-social-la-rioja','club-social-la-rioja-femenino','nuevo','club-social-la-rioja-femenino-m18'),
('JUV','cordoba-athletic-club','cordoba-athletic-club-femenino','nuevo','cordoba-athletic-club-femenino-m18'),
('JUV','indios-de-bolivar','indios-de-bolivar-femenino','nuevo','indios-de-bolivar-femenino-m18'),
('JUV','rivadavia-rugby-club','rivadavia-rugby-club-femenino','nuevo','rivadavia-rugby-club-femenino-m18'),
('JUV','taborin-rc','taborin-rc-femenino','nuevo','taborin-rc-femenino-m18'),
('JUV','tiro-federal-salta','tiro-federal-salta-femenino','nuevo','tiro-federal-salta-femenino-m18'),
('JUV','trelew-r-c','trelew-r-c-femenino','nuevo','trelew-r-c-femenino-m18'),
('MAY','aguara-guazu','aguara-guazu-femenino','nuevo','aguara-guazu-femenino'),
('MAY','aguilas-rc-saenz-pena','aguilas-rc-saenz-pena-femenino','nuevo','aguilas-rc-saenz-pena-femenino'),
('MAY','alberdi','alberdi-femenino','nuevo','alberdi-femenino'),
('MAY','alma-juniors','alma-juniors-femenino','nuevo','alma-juniors-femenino'),
('MAY','alto-valle','alto-valle-femenino','nuevo','alto-valle-femenino'),
('MAY','argentino-de-bahia-blanca','argentino-de-bahia-blanca-femenino','nuevo','argentino-de-bahia-blanca-femenino'),
('MAY','argentino-de-trenque-lauquen','argentino-de-trenque-lauquen-femenino','nuevo','argentino-de-trenque-lauquen-femenino'),
('MAY','bigua-rugby-club','bigua-rugby-club-femenino','nuevo','bigua-rugby-club-femenino'),
('MAY','c-u-q','c-u-q-femenino','nuevo','c-u-q-femenino'),
('MAY','calafate-r-c','calafate-r-c-femenino','nuevo','calafate-r-c-femenino'),
('MAY','capri','capri-femenino','nuevo','capri-femenino'),
('MAY','caraya','caraya-femenino','nuevo','caraya-femenino'),
('MAY','cardenales-r-c','cardenales-r-c-femenino','nuevo','cardenales-r-c-femenino'),
('MAY','casa-de-padua','casa-de-padua-femenino','existe','casa-de-padua-femenino'),
('MAY','catamarca-r-c','catamarca-r-c-femenino','nuevo','catamarca-r-c-femenino'),
('MAY','catriel-r-c','catriel-r-c-femenino','nuevo','catriel-r-c-femenino'),
('MAY','centro-naval','centro-naval-femenino','existe','centro-naval-femenino'),
('MAY','cha-roga-r-c','cha-roga-r-c-femenino','nuevo','cha-roga-r-c-femenino'),
('MAY','chaco-r-c','chaco-r-c-femenino','nuevo','chaco-r-c-femenino'),
('MAY','ciudad-de-buenos-aires','ciudad-femenino','existe','ciudad-femenino'),
('MAY','club-universitario-de-cordoba','club-universitario-de-cordoba-femenino','nuevo','club-universitario-de-cordoba-femenino'),
('MAY','coipu-r-c','coipu-r-c-femenino','nuevo','coipu-r-c-femenino'),
('MAY','comercial-r-c','comercial-r-c-femenino','nuevo','comercial-r-c-femenino'),
('MAY','cordoba-athletic-club','cordoba-athletic-club-femenino','nuevo','cordoba-athletic-club-femenino'),
('MAY','cordoba-rugby-club','cordoba-rugby-club-femenino','nuevo','cordoba-rugby-club-femenino'),
('MAY','cuyo','cuyo-femenino','nuevo','cuyo-femenino'),
('MAY','deportivo-portugues','deportivo-portugues-femenino','nuevo','deportivo-portugues-femenino'),
('MAY','echague','echague-femenino','nuevo','echague-femenino'),
('MAY','encarnacion-rugby-club','encarnacion-rugby-club-femenino','nuevo','encarnacion-rugby-club-femenino'),
('MAY','g-e-i','g-e-i-femenino','nuevo','g-e-i-femenino'),
('MAY','jockey-club-san-juan','jockey-club-san-juan-femenino','nuevo','jockey-club-san-juan-femenino'),
('MAY','la-plata','la-plata-femenino','existe','la-plata-femenino'),
('MAY','las-teras','las-teras-femenino','nuevo','las-teras-femenino'),
('MAY','los-tordos-rugby-club','los-tordos-rugby-club-femenino','nuevo','los-tordos-rugby-club-femenino'),
('MAY','marabunta-r-c','marabunta-r-c-femenino','nuevo','marabunta-r-c-femenino'),
('MAY','neuquen-r-c','neuquen-r-c-femenino','nuevo','neuquen-r-c-femenino'),
('MAY','nevado','nevado-femenino','nuevo','nevado-femenino'),
('MAY','old-resian-club','old-resian-club-femenino','nuevo','old-resian-club-femenino'),
('MAY','palihue-rc','palihue-rc-femenino','nuevo','palihue-rc-femenino'),
('MAY','patagonia-r-c','patagonia-r-c-femenino','nuevo','patagonia-r-c-femenino'),
('MAY','peumayen-rugby-club','peumayen-rugby-club-femenino','nuevo','peumayen-rugby-club-femenino'),
('MAY','pumai','pumai-femenino','nuevo','pumai-femenino'),
('MAY','regatas-de-resistencia','regatas-de-resistencia-femenino','nuevo','regatas-de-resistencia-femenino'),
('MAY','roca-r-c','roca-r-c-femenino','nuevo','roca-r-c-femenino'),
('MAY','salto-del-guaira','salto-del-guaira-femenino','nuevo','salto-del-guaira-femenino'),
('MAY','san-andres','san-andres-femenino','nuevo','san-andres-femenino'),
('MAY','san-isidro-de-lules','san-isidro-de-lules-femenino','nuevo','san-isidro-de-lules-femenino'),
('MAY','san-jorge-r-c-ua','san-jorge-r-c-ua-femenino','nuevo','san-jorge-r-c-ua-femenino'),
('MAY','san-patricio','san-patricio-femenino','nuevo','san-patricio-femenino'),
('MAY','sitas','sitas-femenino','existe','sitas-femenino'),
('MAY','sixty-r-c','sixty-r-c-femenino','nuevo','sixty-r-c-femenino'),
('MAY','taborin-rc','taborin-rc-femenino','nuevo','taborin-rc-femenino'),
('MAY','universidad-catolica-de-salta','universidad-catolica-de-salta-femenino','nuevo','universidad-catolica-de-salta-femenino'),
('MAY','universidad-nacional-de-cordoba','universidad-nacional-de-cordoba-femenino','nuevo','universidad-nacional-de-cordoba-femenino'),
('MAY','universitario-de-mendoza','universitario-de-mendoza-femenino','nuevo','universitario-de-mendoza-femenino'),
('MAY','universitario-de-tierra-del-fuego','universitario-de-tierra-del-fuego-femenino','nuevo','universitario-de-tierra-del-fuego-femenino'),
('MAY','universitario-de-villa-mercedes','universitario-de-villa-mercedes-femenino','nuevo','universitario-de-villa-mercedes-femenino'),
('MAY','unsl','unsl-femenino','nuevo','unsl-femenino'),
('MAY','villa-gesell-r-c','villa-gesell-r-c-femenino','nuevo','villa-gesell-r-c-femenino');
update mapa set tid = case t when 'MAY' then '4baab70e-06bf-4385-89c4-9a5b5b5ab69d' else '09995687-9182-49e1-a521-f593f54a4ecd' end;

-- 1. Fichas "<Club> Femenino" que faltan: heredan escudo, unión y lugar del club madre.
insert into clubs (id, slug, name, short_name, category, sport, sport_id, union_id, country, city, region,
                   logo_url, is_visible, visibility, claim_status, entity_type)
select distinct on (m.fem_id) m.fem_id, m.fem_id, b.name || ' Femenino', coalesce(b.short_name, b.name) || ' Femenino', 'femenino',
       b.sport, b.sport_id, b.union_id, b.country, b.city, b.region, b.logo_url, b.is_visible, b.visibility, b.claim_status, b.entity_type
from mapa m join clubs b on b.id = m.base
where m.fem_estado = 'nuevo'
on conflict (id) do nothing;

-- 2. Fichas "<Club> Femenino M18" para juveniles.
insert into clubs (id, slug, name, short_name, category, sport, sport_id, union_id, country, city, region,
                   logo_url, is_visible, visibility, claim_status, entity_type)
select distinct on (m.destino) m.destino, m.destino, f.name || ' M18', coalesce(b.short_name, b.name) || ' Femenino M18', 'M18',
       coalesce(f.sport, b.sport), coalesce(f.sport_id, b.sport_id), coalesce(f.union_id, b.union_id), coalesce(f.country, b.country),
       coalesce(f.city, b.city), coalesce(f.region, b.region), coalesce(f.logo_url, b.logo_url), b.is_visible, b.visibility, b.claim_status, b.entity_type
from mapa m join clubs b on b.id = m.base join clubs f on f.id = m.fem_id
where m.t = 'JUV'
on conflict (id) do nothing;

-- 3. Vínculos: madre -> femenina (women), femenina -> M18 (youth).
insert into club_derivatives (base_club_id, derived_club_id, derivative_type)
select distinct m.base, m.fem_id, 'women' from mapa m
where not exists (select 1 from club_derivatives d where d.base_club_id = m.base and d.derived_club_id = m.fem_id);
insert into club_derivatives (base_club_id, derived_club_id, derivative_type)
select distinct m.fem_id, m.destino, 'youth' from mapa m
where m.t = 'JUV' and not exists (select 1 from club_derivatives d where d.base_club_id = m.fem_id and d.derived_club_id = m.destino);

-- 4. Reasignación, siempre acotada al torneo.
update matches x set home_club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.home_club_id = m.base;
update matches x set away_club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.away_club_id = m.base;
update tournament_participants x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update team_season_entries x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update tournament_standings x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update tournament_seasons x set champion_club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.champion_club_id = m.base;
update team_labels x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update team_stats x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update player_stats x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update roster_memberships x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update season_rosters x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;
update club_stats x set club_id = m.destino from mapa m where x.tournament_id::text = m.tid and x.club_id = m.base;

drop table mapa;
commit;
