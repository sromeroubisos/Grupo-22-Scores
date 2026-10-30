"""Resuelve cada jugador de cada tarjeta a una ficha (people.id) y arma el JSON de ficha-partido-local.
Solo lectura; escribe resolucion.json y top10a.json."""
import json, re, unicodedata, collections, sys
from datetime import date
exec(open('comparar.py', encoding='utf-8').read().split("T = '55f28")[0])
sys.path.insert(0, '../region-centro-tarjetas')
ms = json.load(open('db_matches.json', encoding='utf-8')); cards = json.load(open('cards.json', encoding='utf-8'))

def plain(s): return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')
def toks(s): return sorted(re.sub(r'[^a-z ]', ' ', plain(s)).split())
def key(s): return ' '.join(toks(s))
def nat(raw):
    raw = re.sub(r'^\d+\s*-\s*', '', raw.strip())
    if ',' in raw:
        a, n = [x.strip() for x in raw.split(',', 1)]; return f'{n} {a}'.strip()
    return raw
def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]
KEY = {'SAN MARTIN R.C.': 'san-martin-de-villa-maria', 'TALA R.C.': 'tala-rugby-club', 'LA TABLADA': 'club-la-tablada', 'JOCKEY CLUB CORDOBA': 'jockey-club-cordoba',
       'CORDOBA ATHLETIC': 'cordoba-athletic-club', 'CLUB UNIVERSITARIO': 'club-universitario-de-cordoba', 'JOCKEY CLUB VILLA MARIA': 'jockey-club-de-villa-maria',
       'URU CURE RC': 'uru-cure-rugby-club', 'PALERMO BAJO': 'club-palermo-bajo', 'CARLOS PAZ R.C.': 'carlos-paz-rugby-club'}
def dd(s): d, m, y = s[:10].split('/'); return date(int(y), int(m), int(d))
people = {}
for club in KEY.values():
    for p in get_all('people', {'select': 'id,club_id,full_name,first_name,last_name', 'club_id': 'eq.' + club}): people[p['id']] = p
byclub = collections.defaultdict(list)
for p in people.values(): byclub[p['club_id']].append(p)
uses = collections.Counter()
for m in ms:
    for s in ('home', 'away'):
        for e in m['lineups'][s]: uses[e['id']] += 1
pares = []
for c in cards:
    h, a = KEY[c['equipos'][0]['club']], KEY[c['equipos'][1]['club']]
    d = dd(c['juego'])
    cand = [m for m in ms if m['home_club_id'] == h and m['away_club_id'] == a and abs((date.fromisoformat(m['date_time'][:10]) - d).days) <= 1]
    assert len(cand) == 1, (c['num'], len(cand))
    pares.append((c, cand[0]))

def resolver(club, r, hint_id):
    """-> (ficha_id|None, como)"""
    nm = nat(r['nombre']); k = key(nm); t = set(k.split())
    ex = [p for p in byclub[club] if key(p['full_name']) == k]
    if ex: return max(ex, key=lambda p: uses[p['id']])['id'], 'exacta'
    cont = [p for p in byclub[club] if len(t) >= 2 and (t < set(key(p['full_name']).split()) or set(key(p['full_name']).split()) < t) and len(set(key(p['full_name']).split())) >= 2]
    if len(cont) == 1: return cont[0]['id'], 'contenida'
    if len(cont) > 1: return max(cont, key=lambda p: uses[p['id']])['id'], 'contenida*'
    if hint_id and hint_id in people:
        hk = key(people[hint_id]['full_name'])
        if lev(hk, k) <= max(3, len(k) // 4) or set(hk.split()) & t and lev(hk, k) <= 6: return hint_id, 'dorsal-typo'
    near = [p for p in byclub[club] if lev(key(p['full_name']), k) <= 2]
    if len(near) == 1: return near[0]['id'], 'cercana'
    return None, 'nueva'

res = collections.Counter(); filas = []
dni_ficha = collections.defaultdict(collections.Counter); ficha_dni = collections.defaultdict(set)
plan_json = {'descripcion': 'Top 10 A 2026 · 90 tarjetas UCR (txt limpio) · jugadores por DNI, nombres de la tarjeta', 'torneo': '55f28144-3d92-484b-a57d-646e06740808', 'partidos': []}
for c, m in pares:
    club_by_side = {'L': m['home_club_id'], 'V': m['away_club_id']}
    resolved = {}
    for side, k in (('home', 'L'), ('away', 'V')):
        hint = {e.get('number'): e['id'] for e in m['lineups'][side]}
        for r in c['ros'][k]:
            fid, como = resolver(club_by_side[k], r, hint.get(r['n']))
            res[como] += 1
            resolved[(k, r['n'])] = (fid, como, r)
            if fid: dni_ficha[r['dni']][fid] += 1; ficha_dni[fid].add(r['dni'])
            filas.append({'tarjeta': c['num'], 'lado': k, 'n': r['n'], 'dni': r['dni'], 'card': nat(r['nombre']), 'ficha': fid, 'ficha_nombre': people[fid]['full_name'] if fid else None, 'como': como})
print(res)
json.dump(filas, open('resolucion.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# conflictos de identidad
multi_dni = {d: dict(c) for d, c in dni_ficha.items() if len(c) > 1}
multi_ficha = {f: sorted(d) for f, d in ficha_dni.items() if len(d) > 1}
print('DNI con más de una ficha:', len(multi_dni), ' fichas con más de un DNI:', len(multi_ficha))
for d, c in list(multi_dni.items())[:40]: print('  DNI', d, [(people[f]['full_name'], n) for f, n in c.items()])
for f, ds in list(multi_ficha.items())[:30]: print('  ficha', people[f]['full_name'], ds)
print('typos por dorsal:'); [print('  ', x['card'], '<-', x['ficha_nombre']) for x in filas if x['como'] == 'dorsal-typo']
print('nuevas:', sum(1 for x in filas if x['como'] == 'nueva'), sorted({x['card'] for x in filas if x['como'] == 'nueva'})[:60])
