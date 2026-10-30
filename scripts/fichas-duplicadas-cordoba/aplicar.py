"""Convierte plan.json en fusion.sql: una sola transacción que respalda, reapunta y borra.

Por cada grupo queda la ficha `keep` con el nombre `nombre`; las de `borrar` se reemplazan
en todo lo que las nombra y se eliminan:

- matches.lineups / matches.events, match_events (player_id y los ids de details),
  club_trainings (asistencia y planteles guardados): reemplazo del uuid como texto. Un
  uuid no aparece por casualidad dentro de otro, así que el reemplazo es exacto.
- El nombre visible se unifica en las formaciones y en los eventos de la ficha que queda.
- club_person_roles / team_memberships: se reapuntan; el rol que ya existe para la ficha
  que queda se borra en vez de duplicarse.

Antes de tocar nada copia todo a tablas bak_fusion_cba_20261023[sufijo]_* (deshacer = restaurar
desde ahí).
"""
import json, os, unicodedata

OUT = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(os.path.join(OUT, 'plan.json'), encoding='utf-8'))['plan']


def q(s):
    return "'" + s.replace("'", "''") + "'"


def fold(s):
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()


def split_name(entry):
    """first/last a partir de una forma "Apellido, Nombre" del grupo, con las tildes del nombre visible."""
    words = entry['nombre'].split()
    forms = [f['full_name'] for f in entry['fichas']] + [n for f in entry['fichas'] for n in f['nombres']]
    for n in forms:
        if ',' not in n:
            continue
        ap = n.split(',', 1)[0].split()
        k = len(ap)
        if 0 < k < len(words) and [fold(w) for w in words[-k:]] == [fold(w) for w in ap]:
            return ' '.join(words[:-k]), ' '.join(words[-k:])
    if len(words) >= 2:
        return ' '.join(words[:-1]), words[-1]
    return entry['nombre'], ''


# Nombres que el plan no puede resolver solo: la tarjeta los imprime al revés o el OCR
# leyó I por L. (full_name, first_name, last_name)
A_MANO = {
    '16678fb8-afc9-41d4-86e4-3264d6b53444': ('Agustín Segura', 'Agustín', 'Segura'),
    '61faeb9d-cf9c-4258-b8b5-7fb436355e32': ('Simon Iglesias', 'Simon', 'Iglesias'),
    '598e1706-4f2b-42ca-85c8-a3dcf357d205': ('Máximo Iuliano', 'Máximo', 'Iuliano'),
}

# Segunda pasada: el nombre que elige el plan es el más largo, y a veces el más largo es
# el que trae el error del OCR.
POR_NOMBRE = {
    'Isalas Such': ('Isaias Such', 'Isaias', 'Such'),
    'Joaquin Famorano': ('Joaquin Zamorano', 'Joaquin', 'Zamorano'),
    'Ricardo Francisc Gauna Martin': ('Ricardo Francisco Gauna Martin', 'Ricardo Francisco', 'Gauna Martin'),
    'Nicolas Ezequ Sanchez Gómez': ('Nicolás Ezequiel Sánchez Gómez', 'Nicolás Ezequiel', 'Sánchez Gómez'),
    'Ramiro Valdes Iribarren': ('Ramiro Valdés Iribarren', 'Ramiro', 'Valdés Iribarren'),
}

import sys
SUFIJO = sys.argv[1] if len(sys.argv) > 1 else ''  # para una segunda corrida: tablas de respaldo nuevas

pairs, names = [], []
for e in plan:
    for b in e['borrar']:
        pairs.append(f"({q(b)}::uuid, {q(e['keep'])}::uuid)")
    if e['nombre'] in POR_NOMBRE:
        A_MANO[e['keep']] = POR_NOMBRE[e['nombre']]
    if e['keep'] in A_MANO:
        e['nombre'], first, last = A_MANO[e['keep']]
        names.append(f"({q(e['keep'])}::uuid, {q(e['nombre'])}, {q(first)}, {q(last)})")
        continue
    if e.get('first') is not None:  # la ficha que queda ya tiene bien el nombre: no se toca
        first, last = e['first'], e['last'] or ''
    else:
        first, last = split_name(e)
    names.append(f"({q(e['keep'])}::uuid, {q(e['nombre'])}, {q(first)}, {q(last)})")

PAIRS = ',\n'.join(pairs)
NAMES = ',\n'.join(names)
sql = f"""
begin;

create temp table fx(loser uuid primary key, keep uuid not null) on commit drop;
insert into fx values
{PAIRS};

create temp table fn(keep uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into fn values
{NAMES};

create temp table fall on commit drop as select loser id from fx union select keep from fn;
-- una sola expresión regular: cada fila se recorre una vez, no una por ficha
create temp table rx on commit drop as
  select (select string_agg(id::text, '|') from fall) todos, (select string_agg(loser::text, '|') from fx) perdedoras;

-- respaldo
create table bak_fusion_cba_20261023{SUFIJO}_people as select * from people where id in (select id from fall);
create table bak_fusion_cba_20261023{SUFIJO}_matches as select m.id, m.lineups, m.events from matches m, rx
  where m.lineups::text ~ rx.todos or coalesce(m.events::text, '') ~ rx.todos;
create table bak_fusion_cba_20261023{SUFIJO}_match_events as select me.* from match_events me, rx
  where me.player_id in (select id from fall) or me.details::text ~ rx.perdedoras;
create table bak_fusion_cba_20261023{SUFIJO}_roles as select * from club_person_roles where person_id in (select id from fall);
create table bak_fusion_cba_20261023{SUFIJO}_team_memberships as select * from team_memberships where person_id in (select loser from fx);
create table bak_fusion_cba_20261023{SUFIJO}_trainings as select t.id, t.attendance, t.players_snapshot, t.evaluation from club_trainings t, rx
  where (coalesce(t.attendance::text,'')||coalesce(t.players_snapshot::text,'')||coalesce(t.evaluation::text,'')) ~ rx.perdedoras;

-- reemplazo de ids embebidos (texto)
create or replace function pg_temp.swap(t text) returns text language plpgsql as $$
declare r record;
begin
  if t is null then return null; end if;
  for r in select loser, keep from fx loop
    if position(r.loser::text in t) > 0 then t := replace(t, r.loser::text, r.keep::text); end if;
  end loop;
  return t;
end $$;

update matches m set lineups = pg_temp.swap(lineups::text)::jsonb, events = pg_temp.swap(events::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023{SUFIJO}_matches);
update match_events set player_id = coalesce((select keep from fx where loser = player_id), player_id),
  details = pg_temp.swap(details::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023{SUFIJO}_match_events);
update club_trainings t set attendance = pg_temp.swap(attendance::text)::jsonb,
  players_snapshot = pg_temp.swap(players_snapshot::text)::jsonb, evaluation = pg_temp.swap(evaluation::text)::jsonb
  where id in (select id from bak_fusion_cba_20261023{SUFIJO}_trainings);

-- nombre visible unificado en las formaciones (solo los lados que son arreglo)
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when fn.keep is not null then x.e || jsonb_build_object('name', fn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join fn on fn.keep::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{{}}'::jsonb)
  where id in (select id from bak_fusion_cba_20261023{SUFIJO}_matches);
update match_events me set player_name = fn.full_name,
  details = case when me.details ? 'playerName' then me.details || jsonb_build_object('playerName', fn.full_name) else me.details end
  from fn where me.player_id = fn.keep;

-- roles y membresías
delete from club_person_roles r using fx
  where r.person_id = fx.loser and exists (select 1 from club_person_roles k where k.person_id = fx.keep
    and k.club_id = r.club_id and k.role = r.role and k.division_id is not distinct from r.division_id);
update club_person_roles r set person_id = fx.keep from fx where r.person_id = fx.loser;
update team_memberships t set person_id = fx.keep from fx where t.person_id = fx.loser;

update people p set full_name = fn.full_name, first_name = fn.first_name, last_name = fn.last_name from fn where p.id = fn.keep;
delete from people where id in (select loser from fx);

commit;
"""
open(os.path.join(OUT, f'fusion{SUFIJO}.sql'), 'w', encoding='utf-8').write(sql)
print(f'{len(pairs)} fichas a borrar · {len(names)} grupos · {len(sql)} bytes')
