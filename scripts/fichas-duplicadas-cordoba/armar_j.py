import json, unicodedata, collections
src = open('plan2.py', encoding='utf-8').read().split('# ── aristas')[0]
g = {'__file__': 'plan2.py'}
exec(compile(src, 'p', 'exec'), g)
people, uses, fold = g['people'], g['uses'], g['fold']
byname = {(p['club_id'], p['full_name']): p for p in people.values()}
# (club, [fichas por full_name], nombre final, ficha a conservar)
G = [
 ('club-palermo-bajo-intermedia', ['Ariel Francisc Olmedo Ramirez', 'Ariel Francisco Olmedo Ramirez'], 'Ariel Francisco Olmedo Ramirez', 'Ariel Francisc Olmedo Ramirez'),
 ('club-palermo-bajo-intermedia', ['Matías Facun Bianchi Altamira', 'Matias Facundo Bianchi Altamira'], 'Matías Facundo Bianchi Altamira', 'Matías Facun Bianchi Altamira'),
 ('club-palermo-bajo-intermedia', ['Mateo Francisco Frontera Croizet', 'Mateo Francis Frontera Croizet'], 'Mateo Francisco Frontera Croizet', 'Mateo Francis Frontera Croizet'),
 ('club-universitario-de-cordoba-intermedia', ['Franco Nahuel González Kogan', 'Franco Nahue González Kogan'], 'Franco Nahuel González Kogan', 'Franco Nahue González Kogan'),
 ('la-tablada-intermedia', ['Ramiro Valdes lribarren', 'Ramiro Valdes Iribarren'], 'Ramiro Valdés Iribarren', 'Ramiro Valdes Iribarren'),
]
plan = []
for club, names, final, keepname in G:
    fs = [byname[(club, n)] for n in names]
    keep = byname[(club, keepname)]['id']
    words = final.split()
    plan.append({'club_id': club, 'por': ['manual'], 'nombre': final, 'keep': keep,
                 'fichas': [{'id': f['id'], 'full_name': f['full_name'], 'usos': uses.get(f['id'], 0), 'nombres': {}, 'dni': []} for f in fs],
                 'borrar': [f['id'] for f in fs if f['id'] != keep], 'first': ' '.join(words[:-1]), 'last': words[-1]})
    print(final, [(f['full_name'], uses.get(f['id'], 0)) for f in fs])
# last: apellido compuesto
for e in plan:
    if e['nombre'] == 'Mateo Francisco Frontera Croizet': e['first'], e['last'] = 'Mateo Francisco', 'Frontera Croizet'
    if e['nombre'] == 'Matías Facundo Bianchi Altamira': e['first'], e['last'] = 'Matías Facundo', 'Bianchi Altamira'
    if e['nombre'] == 'Ariel Francisco Olmedo Ramirez': e['first'], e['last'] = 'Ariel Francisco', 'Olmedo Ramirez'
    if e['nombre'] == 'Franco Nahuel González Kogan': e['first'], e['last'] = 'Franco Nahuel', 'González Kogan'
    if e['nombre'] == 'Ramiro Valdés Iribarren': e['first'], e['last'] = 'Ramiro', 'Valdés Iribarren'
json.dump({'plan': plan, 'conflictos': []}, open('plan.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# renombres: ficha sin tildes -> versión con tildes de la formación; y 2 con apellido primero
cat = json.load(open('nombres_cat.json', encoding='utf-8'))
tl = lambda s: sum(1 for ch in unicodedata.normalize('NFD', s) if unicodedata.category(ch) == 'Mn')
ren = {}
for club, fn, name, n, u, pid in cat['solo_tildes']:
    if tl(name) > tl(fn) and name != name.upper():
        ren.setdefault(pid, (name, n))
        if n > ren[pid][1]: ren[pid] = (name, n)
for pid, (name, n) in ren.items():
    p = people[pid]
    if any(q['club_id'] == p['club_id'] and q['full_name'] == name and q['id'] != pid for q in people.values()):
        print('choca, salteo', name); continue
    p['_nuevo'] = name
for club, fn, name, n, u, pid in cat['orden_distinto']:
    if fn in ('Kaper Nahuel Francisco', 'Meyer Santiago'): people[pid]['_nuevo'] = name
q = lambda s: "'" + s.replace("'", "''") + "'"
def mapw(old, new):
    m = {fold(w): w for w in new.split()}
    return ' '.join(m.get(fold(w), w) for w in (old or '').split())
rows = []
for p in people.values():
    if '_nuevo' not in p: continue
    nn = p['_nuevo']; w = nn.split()
    if p['full_name'] in ('Kaper Nahuel Francisco', 'Meyer Santiago'):
        first, last = (' '.join(w[:-1]), w[-1])
    else:
        first, last = mapw(p['first_name'], nn), mapw(p['last_name'], nn)
    rows.append(f"({q(p['id'])}::uuid,{q(nn)},{q(first)},{q(last)})")
print(len(rows), 'renombres')
open('renombres_k.sql', 'w', encoding='utf-8').write(f"""begin;
create table bak_renombres_cba_20261029_people as select * from people where id in ({','.join(r.split('::')[0] for r in rows)});
create temp table rn(id uuid primary key, full_name text, first_name text, last_name text) on commit drop;
insert into rn values
{',\n'.join(rows)};
update people p set full_name=rn.full_name, first_name=rn.first_name, last_name=rn.last_name from rn where p.id=rn.id;
update matches m set lineups = m.lineups || coalesce((
  select jsonb_object_agg(s.side, (
    select coalesce(jsonb_agg(case when rn.id is not null then x.e || jsonb_build_object('name', rn.full_name) else x.e end order by x.ord), '[]'::jsonb)
    from jsonb_array_elements(s.arr) with ordinality x(e, ord)
    left join rn on rn.id::text = x.e->>'id'))
  from jsonb_each(m.lineups) s(side, arr) where jsonb_typeof(s.arr) = 'array'), '{{}}'::jsonb)
  where m.lineups::text ~ (select string_agg(id::text,'|') from rn);
update match_events me set player_name = rn.full_name,
  details = case when me.details ? 'playerName' then me.details || jsonb_build_object('playerName', rn.full_name) else me.details end
  from rn where me.player_id = rn.id;
commit;
""")
