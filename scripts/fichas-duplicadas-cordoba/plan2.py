"""Fichas duplicadas de Córdoba, pasada por nombre (sin DNI): typos de OCR, nombres
cortados, sufijos de incidencia ("· Lesionado") y nombres incompletos.

Alcance: todo club de la Unión Cordobesa de Rugby / región Córdoba (no hockey).
Siempre dentro del mismo club_id.

Prueba de identidad, de la más a la menos fuerte:
- Dos fichas del mismo club que juegan en el MISMO partido son personas distintas: nunca
  se fusionan (así quedan afuera Juan Bocco / Juan Cruz Bocco, hermanos).
- Mismo conjunto de palabras sin tildes, o uno contenido en el otro (>= 2 palabras), o a
  <= 2 ediciones. Las parecidas por edición piden además compartir torneo o que una no se
  haya usado nunca, para no juntar apellidos parecidos de dos jugadores reales.
- Un grupo con dos fichas que coinciden en algún partido no se toca (va a conflictos).

Escribe plan.json (formato de aplicar.py) e informe2.txt. No toca la base.
"""
import json, re, unicodedata, collections, os
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.dirname(os.path.abspath(__file__))

env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^([A-Z_]+)=(.*)$', line.strip())
    if m:
        env[m.group(1)] = m.group(2).strip().strip('"')
URL = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1'
H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}


def get_all(path, params, page=1000):
    out, off = [], 0
    while True:
        h = dict(H, Range=f'{off}-{off + page - 1}')
        # sin order el paginado por Range puede saltear o repetir filas
        r = requests.get(URL + '/' + path, headers=h, params=dict(params, order='id'), timeout=120)
        r.raise_for_status()
        rows = r.json()
        out += rows
        if len(rows) < page:
            return out
        off += len(rows)


def strip_suffix(s):
    return (s or '').split(' · ')[0].strip()


def fold(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]', ' ', s.lower())


def toks(s):
    return sorted(t for t in fold(strip_suffix(s)).split() if t)


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


# ── clubes de Córdoba ───────────────────────────────────────────────────────────
clubs = get_all('clubs', {'select': 'id,region,city,unions(name)'})
cba = set()
for c in clubs:
    un = ((c.get('unions') or {}).get('name') or '').lower()
    if 'hockey' in un:
        continue
    if 'rdoba' in (c.get('region') or '').lower() or 'cordobesa de rugby' in un or 'rdoba' in (c.get('city') or '').lower():
        cba.add(c['id'])

people = {}
ids = sorted(cba)
for i in range(0, len(ids), 40):
    for p in get_all('people', {'select': 'id,club_id,full_name,first_name,last_name',
                                'club_id': 'in.(' + ','.join(ids[i:i + 40]) + ')'}):
        people[p['id']] = p

# ── partidos: usos, coincidencias y torneos ─────────────────────────────────────
matches = get_all('matches', {'select': 'id,tournament_id,lineups', 'lineup_home_count': 'gt.0'}) + \
          get_all('matches', {'select': 'id,tournament_id,lineups', 'lineup_home_count': 'eq.0', 'lineup_away_count': 'gt.0'})
in_match = collections.defaultdict(set)
tourn = collections.defaultdict(set)
for m in matches:
    for side in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(side) or []):
            pid = e.get('id')
            if pid in people:
                in_match[pid].add(m['id'])
                tourn[pid].add(m['tournament_id'])
uses = {p: len(s) for p, s in in_match.items()}


def together(a, b):
    return bool(in_match.get(a, set()) & in_match.get(b, set()))


# ── aristas ─────────────────────────────────────────────────────────────────────
parent = {}


def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb


def prefix_close(a, b):
    """Mismas palabras salvo que alguna está cortada ('Alejand' / 'Alejandro')."""
    if len(a) != len(b):
        return False
    return all(x == y or (min(len(x), len(y)) >= 3 and (x.startswith(y) or y.startswith(x)) and abs(len(x) - len(y)) <= 4)
               for x, y in zip(a, b))


by_club = collections.defaultdict(list)
for p in people.values():
    by_club[p['club_id']].append(p['id'])

razon = {}
for club, pids in by_club.items():
    info = {}
    for pid in pids:
        t = toks(people[pid]['full_name'])
        info[pid] = (t, [x for x in t if len(x) > 1])
    for i, a in enumerate(pids):
        ta, ca = info[a]
        if len(ca) < 2:
            continue
        for b in pids[i + 1:]:
            tb, cb = info[b]
            if len(cb) < 2 or together(a, b):
                continue
            sa, sb = set(ca), set(cb)
            why = None
            if ta == tb or ca == cb:
                why = 'igual'
            elif (sa < sb or sb < sa):
                why = 'contenido'
            else:
                ka, kb = ' '.join(ca), ' '.join(cb)
                if len(ka) >= 10 and lev(ka, kb) <= 2 or prefix_close(ca, cb):
                    if (tourn.get(a, set()) & tourn.get(b, set())) or not uses.get(a) or not uses.get(b):
                        why = 'parecido'
            if why:
                union(a, b)
                razon[(a, b)] = why

groups = collections.defaultdict(list)
for x in list(parent):
    groups[find(x)].append(x)

TRUNC_MIN = 2


def score(name, pool):
    """Menor es mejor: (cortado, ruido OCR, -tildes). pool = todos los nombres del grupo."""
    t = fold(strip_suffix(name)).split()
    otros = {w for n in pool if n != name for w in fold(strip_suffix(n)).split()}
    cortado = sum(1 for w in t if len(w) >= TRUNC_MIN and any(o != w and o.startswith(w) for o in otros))
    ruido = sum(1 for w in strip_suffix(name).split() if re.match(r'^(?:[lL]g|[iI]lg)', w))
    ruido += sum(1 for w in name if w.isdigit())
    tildes = sum(1 for c in unicodedata.normalize('NFD', name) if unicodedata.category(c) == 'Mn')
    return (cortado, ruido, -tildes)


plan, conflictos = [], []
for root, g in groups.items():
    if len(g) < 2:
        continue
    g = sorted(g)
    club = people[g[0]]['club_id']
    if any(together(a, b) for i, a in enumerate(g) for b in g[i + 1:]):
        conflictos.append({'club_id': club, 'fichas': [{'id': x, 'full_name': people[x]['full_name'], 'usos': uses.get(x, 0)} for x in g]})
        continue
    nombres = {x: strip_suffix(people[x]['full_name']) for x in g}
    pool = list(set(nombres.values()))
    usos_por_nombre = collections.Counter()
    for x in g:
        usos_por_nombre[nombres[x]] += uses.get(x, 0)
    mejor = min(pool, key=lambda n: score(n, pool) + (-usos_por_nombre[n], -len(n.split()), n))
    cand = [x for x in g if nombres[x] == mejor]
    keep = max(cand, key=lambda x: (uses.get(x, 0), people[x]['full_name'] == mejor, x))
    k = people[keep]
    por = sorted({v for (a, b), v in razon.items() if a in g and b in g})
    plan.append({
        'club_id': club,
        'por': por,
        'fichas': [{'id': x, 'full_name': people[x]['full_name'], 'usos': uses.get(x, 0), 'nombres': {}, 'dni': []} for x in g],
        'keep': keep, 'nombre': mejor, 'borrar': [x for x in g if x != keep],
        'first': k['first_name'] if k['full_name'] == mejor else None,
        'last': k['last_name'] if k['full_name'] == mejor else None,
    })

# Casos donde la heurística elige mal el nombre (typo de OCR, sin tilde que sí va, nombre cortado):
# nombre elegido por el plan -> (nombre final, full_name de la ficha que se queda o None)
CORRECCIONES = {
    'Agustín Homero Cañas': ('Agustín Homero Cañas', 'Agustin Homero Cañas'),
    'Benjamin Ezé Marmol Maldonado': ('Benjamin Marmol Maldonado', 'Benjamin Marmol Maldonado'),
    'Santiago larossi': ('Santiago Iarossi', 'Santiago Iarossi'),
    'Nicolás EzequiB Aspera Contreras': ('Nicolás Ezequiel Aspera Contreras', 'Nicolas Ezequiel Aspera Contreras'),
    'Maximilial Gimenez Porporatto': ('Maximiliano Gimenez Porporatto', None),
    'Estanislao Gómez': ('Estanislao Gomez Fernandez', 'Estanislao Gomez Fernandez'),
    'Federico Gutiérrez': ('Federico Gutierrez Marquez', 'Federico Gutierrez Marquez'),
    'Conradot Cortés': ('Conrado Cortés', 'Conrado Cortes'),
    'Gastón Garayzábal': ('Gastón Garayzabal', 'Gastón Garayzabal'),
    'Lucas Tomi Busdrago Marinelli': ('Lucas Busdrago Marinelli', 'Lucas Busdrago Marinelli'),
    'Jeremias Trigp': ('Jeremias Trigg', 'Jeremias Trigg'),
    'David DiTommaso': ('David Di Tommaso', 'David Di Tommaso'),
    'Joaquin Alejandro Castillo Ceballos': ('Joaquin Alejandro Castillo Ceballos', 'Joaquín Alejand Castillo Ceballos'),
}
for e in plan:
    if e['nombre'] not in CORRECCIONES:
        continue
    nombre, keep_name = CORRECCIONES[e['nombre']]
    if keep_name:
        e['keep'] = next(f['id'] for f in e['fichas'] if f['full_name'] == keep_name)
    else:
        e['keep'] = max(e['fichas'], key=lambda f: f['usos'])['id']
    k = people[e['keep']]
    e['nombre'] = nombre
    e['borrar'] = [f['id'] for f in e['fichas'] if f['id'] != e['keep']]
    e['first'] = k['first_name'] if k['full_name'] == nombre else None
    e['last'] = k['last_name'] if k['full_name'] == nombre else None

json.dump({'plan': plan, 'conflictos': conflictos}, open(os.path.join(OUT, 'plan.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

with open(os.path.join(OUT, 'informe2.txt'), 'w', encoding='utf-8') as fh:
    fh.write(f'clubes de Córdoba: {len(cba)} · fichas leídas: {len(people)}\n')
    fh.write(f'grupos a fusionar: {len(plan)} · fichas que sobran: {sum(len(e["borrar"]) for e in plan)} · conflictos: {len(conflictos)}\n\n')
    for e in sorted(plan, key=lambda e: (e['club_id'], e['nombre'])):
        fh.write(f'{e["club_id"]:38} -> {e["nombre"]}  [{"+".join(e["por"])}]\n')
        for f_ in e['fichas']:
            fh.write(f'   {"*" if f_["id"] == e["keep"] else " "} {f_["usos"]:3} {f_["full_name"]}\n')
    fh.write('\n── CONFLICTOS (juegan juntos; no se tocan) ──\n')
    for e in conflictos:
        fh.write(f'{e["club_id"]}\n')
        for f_ in e['fichas']:
            fh.write(f'     {f_["usos"]:3} {f_["full_name"]}\n')

print(open(os.path.join(OUT, 'informe2.txt'), encoding='utf-8').read()[:300])
