"""Fichas duplicadas de los clubes de Córdoba: arma el plan de fusión.

Cada carga de tarjetas de la UCR (Top 10, Interior, M19, Pre A/B, M16/M17…) resolvió
los nombres contra `people` por separado, y el matcher no pliega tildes ni el orden
"Apellido, Nombre". Resultado: el mismo jugador del mismo club con dos o tres fichas,
y la historia partida entre ellas.

Dos pruebas de identidad, siempre DENTRO del mismo club_id (las categorías son clubes
derivados a propósito: la ficha de Intermedia no se fusiona con la de Primera):

1. DNI: las tarjetas originales lo traen. Se cruza cada renglón de la tarjeta con la
   ficha que quedó en la formación de ese partido, y dos fichas con el mismo DNI son
   la misma persona (si además comparten un apellido: un DNI mal leído no fusiona).
2. Nombre plegado: mismo conjunto de palabras sin tildes ni puntuación, en cualquier
   orden ("Diaz Centeno, Ignacio" = "Ignacio Díaz Centeno").

Escribe plan.json (lo que consume aplicar.py) e informe.txt. No toca la base.
"""
import json, re, unicodedata, collections, glob, os
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

TOP10_RAW = 'C:/Users/srome/AppData/Local/Temp/claude/C--Users-srome-OneDrive-Escritorio-Grupo-22-Scores/7b494bc5-3628-4947-af5a-ac6ae4720de0/scratchpad/cards.json'
RAW = [
    TOP10_RAW,
    'scripts/interior-tarjetas/cards.raw.json',
    'scripts/cordoba-m19-tarjetas/cards.raw.json',
    'scripts/cordoba-pre-a-tarjetas/cards.raw.json',
    'scripts/cordoba-pre-b-tarjetas/cards.raw.json',
    'scripts/cordoba-bloque-juv-tarjetas/cards.m16.raw.json',
    'scripts/cordoba-bloque-juv-tarjetas/cards.m17.raw.json',
]

# Torneos de la Unión Cordobesa: de acá salen los clubes del alcance.
TORNEOS_CBA = ('top-10-del-centro', 'torneo-del-interior-a', 'torneo-del-interior-b')
TORNEOS_CBA_PREFIJO = ('torneo-cordobes-', 'regional-centro', 'super-9-b', 'liga-desarrollo')


def fold(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z\ufffd ]', ' ', s.lower())


def tokens(s):
    return frozenset(t for t in fold(s).split() if t)


def tok_eq(a, b):
    """Igualdad de palabra tolerando el � de la tarjeta (letra perdida en la codificación)."""
    if '\ufffd' in a:
        return re.fullmatch(re.escape(a).replace('\ufffd', '.'), b) is not None
    if '\ufffd' in b:
        return tok_eq(b, a)
    return a == b


def set_eq(a, b):
    if len(a) != len(b):
        return False
    rest = list(b)
    for t in a:
        hit = next((x for x in rest if tok_eq(t, x)), None)
        if hit is None:
            return False
        rest.remove(hit)
    return True


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def compatible(a, b):
    """Cada palabra del nombre más corto está en el otro, salvo una letra (OCR: Femandez,
    Lglesias). Hermanos con DNI consecutivo (Federico / Francisco Britos) NO lo son."""
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    def near(t, x):
        if tok_eq(t, x):
            return True
        return (len(t) >= 4 and lev(t, x) <= 1) or (len(t) >= 7 and lev(t, x) <= 2)  # "rn" leído "m"
    return bool(small) and all(any(near(t, x) for x in big) for t in small)


def shares_surname(a, b):
    return any(tok_eq(x, y) for x in a for y in b if len(x) >= 3 and len(y) >= 3)


def get_all(path, params, page=1000):
    out, off = [], 0
    while True:
        h = dict(H, Range=f'{off}-{off + page - 1}')
        r = requests.get(URL + '/' + path, headers=h, params=params, timeout=120)
        r.raise_for_status()
        rows = r.json()
        out += rows
        if len(rows) < page:
            return out
        off += len(rows)


# ── 1. tarjetas crudas: número → [(lado, dorsal, nombre, doc)] ─────────────────
cards = {}
for f in RAW:
    path = f if os.path.isabs(f) else os.path.join(ROOT, f)
    for c in json.load(open(path, encoding='utf-8')):
        if 'tarjeta' in c:  # formato del Top 10
            no = str(c['tarjeta'])
            sides = [c.get('local') or [], c.get('visit') or []]
            rows = [(i, p.get('dor'), p.get('name') or '', p.get('doc')) for i, s in enumerate(sides) for p in s]
        else:
            no = str(c['numero'])
            rows = [(i, p.get('dor'), p.get('nombre') or '', p.get('doc')) for i, s in enumerate(c.get('plantel') or []) for p in s]
        # el OCR pega puntos y dos puntos al DNI ("42160834.", ":d3370974")
        rows = [(a, b, n, re.sub(r'\D', '', str(d or ''))) for a, b, n, d in rows]
        rows = [r for r in rows if re.fullmatch(r'\d{7,9}', r[3])]
        if rows:
            cards[no] = rows

# ── 2. número de tarjeta → partido (rótulos de los JSON cargados) ───────────────
card_match = {}
for f in glob.glob(os.path.join(ROOT, 'src/scripts/formaciones/2026-10-2*-*.json')):
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception:
        continue
    for p in d.get('partidos', []):
        m = re.search(r'tarjeta (\d+)', p.get('rotulo', ''))
        if m and p.get('id'):
            card_match[m.group(1)] = p['id']

# ── 3. clubes del alcance, sus fichas y los usos de cada una ────────────────────
tours = get_all('tournaments', {'select': 'id,slug'})
tour_ids = [t['id'] for t in tours if (t['slug'] or '') in TORNEOS_CBA or (t['slug'] or '').startswith(TORNEOS_CBA_PREFIJO)]
matches = []
for i in range(0, len(tour_ids), 20):
    matches += get_all('matches', {'select': 'id,lineups', 'tournament_id': 'in.(' + ','.join(tour_ids[i:i + 20]) + ')'})
by_id = {m['id']: m for m in matches}

ids_in_lineups = sorted({e['id'] for m in matches for side in ('home', 'away')
                         for e in ((m.get('lineups') or {}).get(side) or []) if e.get('id')})
people = {}
for i in range(0, len(ids_in_lineups), 150):
    for p in get_all('people', {'select': 'id,full_name,club_id', 'id': 'in.(' + ','.join(ids_in_lineups[i:i + 150]) + ')'}):
        people[p['id']] = p
clubs = sorted({p['club_id'] for p in people.values() if p.get('club_id')})
for i in range(0, len(clubs), 40):
    for p in get_all('people', {'select': 'id,full_name,club_id', 'club_id': 'in.(' + ','.join(clubs[i:i + 40]) + ')'}):
        people[p['id']] = p

# Usos en TODAS las formaciones (no solo Córdoba): decide qué ficha se queda.
uses = collections.Counter()
names_used = collections.defaultdict(collections.Counter)
for m in get_all('matches', {'select': 'id,lineups', 'lineup_home_count': 'gt.0'}) + \
         get_all('matches', {'select': 'id,lineups', 'lineup_home_count': 'eq.0', 'lineup_away_count': 'gt.0'}):
    for side in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(side) or []):
            if e.get('id') in people:
                uses[e['id']] += 1
                names_used[e['id']][e.get('name') or ''] += 1

# ── 4. DNI de cada ficha ────────────────────────────────────────────────────────
pid_docs = collections.defaultdict(set)
pid_raw = collections.defaultdict(set)  # "Apellido, Nombre" de la tarjeta: dice cuál es el nombre de pila
sin_cruce = 0
for no, rows in cards.items():
    m = by_id.get(card_match.get(no))
    if not m:
        continue
    lu = m.get('lineups') or {}
    entries = [e for side in ('home', 'away') for e in (lu.get(side) or []) if e.get('id')]
    for side, dor, nombre, doc in rows:
        t = tokens(nombre)
        hit = [e for e in entries if set_eq(t, tokens(e.get('name')))]
        if len(hit) != 1:
            # por dorsal, en cualquiera de los dos lados (la tarjeta a veces invierte local/visitante)
            hit = [e for e in entries if e.get('number') == dor and shares_surname(t, tokens(e.get('name')))]
        if len(hit) == 1:
            pid_docs[hit[0]['id']].add(str(doc))
            pid_raw[hit[0]['id']].add(nombre)
        else:
            sin_cruce += 1

# ── 5. grupos por club (unión de DNI y nombre plegado) ─────────────────────────
parent, reasons = {}, collections.defaultdict(set)


def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a, b, why):
    reasons[find(a)].add(why)
    reasons[find(b)].add(why)
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb
        reasons[rb] |= reasons.pop(ra, set())


def name_keys(pid):
    ks = {tokens(people[pid]['full_name'])} | {tokens(n) for n in names_used[pid]}
    return {k for k in ks if len(k) >= 2}


by_club = collections.defaultdict(list)
for p in people.values():
    if p.get('club_id') in clubs:
        by_club[p['club_id']].append(p['id'])

for club, pids_club in by_club.items():
    doc_idx = collections.defaultdict(set)
    key_idx = collections.defaultdict(set)
    for pid in pids_club:
        for d in pid_docs.get(pid, ()):
            doc_idx[d].add(pid)
        for k in name_keys(pid):
            key_idx[k].add(pid)
    # DNI: igual o a un dígito (el OCR lee 7 por 2), y con un apellido en común.
    con_doc = sorted(p for p in pids_club if pid_docs.get(p))
    all_tok = {p: frozenset().union(*name_keys(p)) if name_keys(p) else frozenset() for p in pids_club}
    for i, a in enumerate(con_doc):
        for b in con_doc[i + 1:]:
            if any(lev(x, y) <= 1 for x in pid_docs[a] for y in pid_docs[b]) and \
                    any(compatible(ka, kb) for ka in name_keys(a) for kb in name_keys(b)):
                union(a, b, 'dni')
    for k, pids in key_idx.items():
        pids = sorted(pids)
        for o in pids[1:]:
            union(pids[0], o, 'nombre')
    # "Avaca L": apellido + inicial. Solo si hay UN candidato en el club.
    for p in pids_club:
        t = tokens(people[p]['full_name'])
        ini = [x for x in t if len(x) == 1]
        rest = t - set(ini)
        if len(ini) != 1 or not rest:
            continue
        cands = [o for o in pids_club if o != p and rest <= all_tok[o]
                 and any(x.startswith(ini[0]) for x in all_tok[o] - rest)]
        if len({find(o) for o in cands}) == 1:
            union(p, cands[0], 'inicial')

groups = collections.defaultdict(list)
for x in list(parent):
    groups[find(x)].append(x)

# Dos DNI distintos en un grupo = dos personas con el mismo nombre: ese grupo no se toca.
plan, conflictos = [], []
for root, g in groups.items():
    if len(g) < 2:
        continue
    g = sorted(g)
    docs = set().union(*(pid_docs.get(x, set()) for x in g))
    entry = {
        'club_id': people[g[0]]['club_id'],
        'por': sorted(reasons.get(root, ())),
        'fichas': [{'id': x, 'full_name': people[x]['full_name'], 'usos': uses[x],
                    'nombres': dict(names_used[x]), 'dni': sorted(pid_docs.get(x, ()))} for x in g],
    }
    # El OCR lee mal algún dígito del DNI (42979960 / 472979960, 46846259 / 46846759):
    # hasta dos ediciones es el mismo documento; más que eso, dos personas.
    if any(lev(a, b) > 2 for a in docs for b in docs):
        conflictos.append(entry)
        continue
    keep = max(g, key=lambda x: (uses[x], len(tokens(people[x]['full_name'])), x))
    cands = collections.Counter()
    for x in g:
        cands.update({n: c for n, c in names_used[x].items() if n})
        cands[people[x]['full_name']] += 0
    # nombre visible: el de más palabras, con tildes si las hay, sin "Apellido, Nombre"
    keep_name = people[keep]['full_name']
    given = {fold(n.split(',', 1)[1]).split()[0] for x in g
             for n in pid_raw.get(x, set()) | set(cands) if ',' in n and fold(n.split(',', 1)[1]).split()}
    display = max(cands, key=lambda n: (',' not in n, len(tokens(n)), (fold(n).split() or [''])[0] in given,
                                        n != fold(n).strip(), n == keep_name, cands[n]))
    entry.update({'keep': keep, 'nombre': display, 'borrar': [x for x in g if x != keep]})
    plan.append(entry)

json.dump({'plan': plan, 'conflictos': conflictos}, open(os.path.join(OUT, 'plan.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

with open(os.path.join(OUT, 'informe.txt'), 'w', encoding='utf-8') as fh:
    fh.write(f'tarjetas con DNI: {len(cards)} · con partido: {sum(1 for c in cards if c in card_match)}\n')
    fh.write(f'fichas con DNI: {len(pid_docs)} · renglones sin cruce: {sin_cruce}\n')
    fh.write(f'clubes: {len(by_club)} · grupos a fusionar: {len(plan)} · fichas que sobran: {sum(len(e["borrar"]) for e in plan)}\n')
    fh.write(f'grupos con DNI distinto (no se tocan): {len(conflictos)}\n\n')
    for e in sorted(plan, key=lambda e: (e['club_id'], e['nombre'])):
        fh.write(f'{e["club_id"]:40} -> {e["nombre"]}  [{"+".join(e["por"])}]\n')
        for f_ in e['fichas']:
            mark = '*' if f_['id'] == e['keep'] else ' '
            fh.write(f'   {mark} {f_["usos"]:3} {f_["full_name"]:40} {",".join(f_["dni"])}\n')
    fh.write('\n── CONFLICTOS (DNI distinto) ──\n')
    for e in conflictos:
        fh.write(f'{e["club_id"]}\n')
        for f_ in e['fichas']:
            fh.write(f'     {f_["usos"]:3} {f_["full_name"]:40} {",".join(f_["dni"])}\n')

print(open(os.path.join(OUT, 'informe.txt'), encoding='utf-8').read()[:400])
