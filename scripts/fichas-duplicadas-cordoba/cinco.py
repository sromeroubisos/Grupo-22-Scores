import collections, re
exec(open('../top10-a-tarjetas/comparar.py', encoding='utf-8').read().split("T = '55f28")[0])
import unicodedata
def fold(s): return ' '.join(sorted(re.sub(r'[^a-z ]',' ',''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn')).split()))
objetivo = {'facundo rodriguez','juan ignacio rodriguez','rodrigo navarro','tomas montilla','lucas bur'}
allp = get_all('people', {'select':'id,club_id,full_name,birth_date,position,photo_url'})
fich = [p for p in allp if fold(p['full_name']) in objetivo or fold(p['full_name']) in {fold(x) for x in objetivo}]
tn = {t['id']: t['name'] for t in get_all('tournaments', {'select':'id,name'})}
ms = get_all('matches', {'select':'id,tournament_id,date_time,home_club_id,away_club_id,lineups', 'lineup_home_count':'gt.0'})
use = collections.defaultdict(list)
ids = {p['id'] for p in fich}
for m in ms:
    for s in ('home','away'):
        for e in (m['lineups'] or {}).get(s) or []:
            if e.get('id') in ids: use[e['id']].append((m['date_time'][:10], tn.get(m['tournament_id'],'?')[:38], e.get('number'), s, m['home_club_id'] if s=='home' else m['away_club_id']))
for k in sorted({fold(p['full_name']) for p in fich}):
    print('\n==', k)
    for p in [p for p in fich if fold(p['full_name'])==k]:
        u = sorted(use[p['id']])
        tor = collections.Counter(x[1] for x in u)
        nums = collections.Counter(x[2] for x in u).most_common(3)
        print(f"  {p['club_id']:30} {p['full_name']:28} partidos={len(u)} fechas={u[0][0] if u else '-'}..{u[-1][0] if u else '-'} dorsales={nums} pos={p['position']} nac={p['birth_date']}")
        for t, n in tor.most_common(4): print('       ', n, t)
