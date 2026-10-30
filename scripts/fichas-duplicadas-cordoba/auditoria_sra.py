"""Super Rugby Américas: jugadores con más de una ficha (franquicia + club local). Solo lectura."""
import collections, json
src = open('plan2.py', encoding='utf-8').read().split('# ── Córdoba')[0].split('# ── clubes de Córdoba')[0]
g = {'__file__': 'plan2.py'}
exec(compile(src, 'p', 'exec'), g)
get_all, fold, strip_suffix = g['get_all'], g['fold'], g['strip_suffix']
SRA = 'f76e47e2-5f9c-4f39-8f06-f6137f5a2846'
ms = get_all('matches', {'select': 'id,home_club_id,away_club_id,lineups,tournament_id', 'tournament_id': 'eq.' + SRA})
ev = get_all('match_events', {'select': 'id,match_id,player_id,player_name,event_type', 'match_id': 'in.(' + ','.join(m['id'] for m in ms[:0] or []) + ')'}) if False else []
mid = [m['id'] for m in ms]
for i in range(0, len(mid), 60):
    ev += get_all('match_events', {'select': 'id,match_id,player_id,player_name,event_type', 'match_id': 'in.(' + ','.join(mid[i:i+60]) + ')'})
print('partidos', len(ms), 'eventos', len(ev))
clubs = collections.Counter()
for m in ms: clubs[m['home_club_id']] += 1; clubs[m['away_club_id']] += 1
print('clubes SRA:', dict(clubs))
pids = set(); inl = collections.defaultdict(set)
for m in ms:
    for s in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(s) or []):
            if e.get('id'): pids.add(e['id']); inl[e['id']].add(m['id'])
for e in ev:
    if e['player_id']: pids.add(e['player_id'])
print('jugadores SRA (ids):', len(pids))
ppl = {}
ids = sorted(pids)
for i in range(0, len(ids), 100):
    for p in get_all('people', {'select': 'id,club_id,full_name', 'id': 'in.(' + ','.join(ids[i:i+100]) + ')'}): ppl[p['id']] = p
print('con ficha:', len(ppl), ' club de las fichas:', collections.Counter(p['club_id'] for p in ppl.values()).most_common(15))
# otras fichas con el mismo nombre plegado en cualquier club
allp = get_all('people', {'select': 'id,club_id,full_name'})
print('people total', len(allp))
by = collections.defaultdict(list)
for p in allp: by[' '.join(sorted(fold(strip_suffix(p['full_name'])).split()))].append(p)
# uso fuera de SRA
out = []
for pid, p in ppl.items():
    k = ' '.join(sorted(fold(strip_suffix(p['full_name'])).split()))
    otras = [q for q in by[k] if q['id'] != pid]
    if otras and len(k.split()) >= 2:
        out.append({'sra': p, 'otras': otras, 'partidos_sra': len(inl.get(pid, []))})
print('fichas SRA con homónimo plegado en otro lado:', len(out))
json.dump(out, open('sra_homonimos.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
