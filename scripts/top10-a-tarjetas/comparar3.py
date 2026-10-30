import json, re, unicodedata, collections
exec(open('comparar.py', encoding='utf-8').read().split("T = '55f28")[0])
ms = json.load(open('db_matches.json', encoding='utf-8')); cards = json.load(open('cards.json', encoding='utf-8'))
def fold(s): return ' '.join(sorted(re.sub(r'[^a-z ]', ' ', ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')).split()))
def nat(raw):  # "Apellido, Nombre" -> "Nombre Apellido"
    if ',' in raw:
        a, n = [x.strip() for x in raw.split(',', 1)]; return f'{n} {a}'.strip()
    return raw.strip()
KEY = {'SAN MARTIN R.C.': 'san-martin-de-villa-maria', 'TALA R.C.': 'tala-rugby-club', 'LA TABLADA': 'club-la-tablada', 'JOCKEY CLUB CORDOBA': 'jockey-club-cordoba',
       'CORDOBA ATHLETIC': 'cordoba-athletic-club', 'CLUB UNIVERSITARIO': 'club-universitario-de-cordoba', 'JOCKEY CLUB VILLA MARIA': 'jockey-club-de-villa-maria',
       'URU CURE RC': 'uru-cure-rugby-club', 'PALERMO BAJO': 'club-palermo-bajo', 'CARLOS PAZ R.C.': 'carlos-paz-rugby-club'}
from datetime import date, timedelta
def dd(s): d, m, y = s[:10].split('/'); return date(int(y), int(m), int(d))
pares, sin = [], []
for c in cards:
    h, a = KEY[c['equipos'][0]['club']], KEY[c['equipos'][1]['club']]
    d = dd(c['juego'])
    cand = [m for m in ms if m['home_club_id'] == h and m['away_club_id'] == a and abs((date.fromisoformat(m['date_time'][:10]) - d).days) <= 1]
    if len(cand) == 1: pares.append((c, cand[0]))
    else: sin.append((c['num'], h, a, str(d), len(cand)))
print('pares', len(pares), 'sin par', sin)
people = {}
pids = set()
for c, m in pares:
    for s in ('home', 'away'):
        for e in m['lineups'][s]: pids.add(e['id'])
ids = sorted(pids)
for i in range(0, len(ids), 100):
    for p in get_all('people', {'select': 'id,club_id,full_name', 'id': 'in.(' + ','.join(ids[i:i+100]) + ')'}): people[p['id']] = p
bad = []; scorebad = []
for c, m in pares:
    s = m['score'] or {}
    if (s.get('home'), s.get('away')) != (c['equipos'][0]['pts'], c['equipos'][1]['pts']): scorebad.append((c['num'], m['id'][:8], (s.get('home'), s.get('away')), (c['equipos'][0]['pts'], c['equipos'][1]['pts'])))
    for side, k in (('home', 'L'), ('away', 'V')):
        ros = {r['n']: r for r in c['ros'][k]}
        seen = {}
        for e in m['lineups'][side]:
            n = e.get('number'); r = ros.get(n)
            nm = people[e['id']]['full_name'] if e['id'] in people else e.get('name')
            if not r: bad.append((c['num'], side, n, nm, '(dorsal no está en la tarjeta)')); continue
            if fold(nat(r['nombre'])) != fold(nm) and fold(nat(r['nombre'])) != fold(e.get('name') or ''):
                bad.append((c['num'], side, n, nm, nat(r['nombre']), r['dni']))
print('marcador distinto:', len(scorebad)); [print('  ', x) for x in scorebad]
print('dorsal con otra persona / nombre distinto:', len(bad))
for b in bad[:80]: print('  ', b)
json.dump({'bad': bad, 'scorebad': scorebad}, open('dif.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
