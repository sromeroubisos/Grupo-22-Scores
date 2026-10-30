import collections, re, itertools, unicodedata
exec(open('comparar.py', encoding='utf-8').read().split("T = '55f28")[0])
def fold(s): return ' '.join(sorted(re.sub(r'[^a-z ]',' ',''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn')).split()))
obj = {'bur lucas','facundo rodriguez','ignacio juan rodriguez','navarro rodrigo','montilla tomas'}
allp = get_all('people', {'select':'id,club_id,full_name'})
fich = [p for p in allp if fold(p['full_name']) in obj]
ms = get_all('matches', {'select':'id,date_time,lineups', 'lineup_home_count':'gt.0'})
days = collections.defaultdict(set); ids={p['id'] for p in fich}; name={p['id']:(p['club_id'],fold(p['full_name'])) for p in fich}
for m in ms:
    for s in ('home','away'):
        for e in (m['lineups'] or {}).get(s) or []:
            if e.get('id') in ids: days[e['id']].add(m['date_time'][:10])
for k in sorted(obj):
    ps=[p for p in fich if fold(p['full_name'])==k]
    print('==',k)
    for a,b in itertools.combinations(ps,2):
        inter=days[a['id']]&days[b['id']]
        print(f"  {a['club_id']} vs {b['club_id']}: mismo día {sorted(inter)}")
