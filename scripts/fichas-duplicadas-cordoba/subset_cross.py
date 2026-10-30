import re, json, collections
src = open('plan_cross.py', encoding='utf-8').read().split("grp = collections.defaultdict(list)")[0]
exec(compile(src, 'pc', 'exec'), {'__file__': 'plan_cross.py', **globals()}) if False else None
g = {'__file__': 'plan_cross.py'}
exec(compile(src, 'pc', 'exec'), g)
allp, clubs, FR, SEL, CAT, fold, strip_suffix, get_all = g['allp'], g['clubs'], g['FR'], g['SEL'], g['CAT'], g['fold'], g['strip_suffix'], g['get_all']
reg = {c: (clubs[c].get('region') or '') for c in clubs}
ms = get_all('matches', {'select': 'id,lineups', 'lineup_home_count': 'gt.0'}) + get_all('matches', {'select': 'id,lineups', 'lineup_home_count': 'eq.0', 'lineup_away_count': 'gt.0'})
inm = collections.defaultdict(set)
for m in ms:
    for s in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(s) or []):
            if e.get('id'): inm[e['id']].add(m['id'])
toks = lambda s: set(fold(strip_suffix(s)).split())
FRp = [p for p in allp if p['club_id'] in FR or p['club_id'] in SEL]
Lp = [p for p in allp if p['club_id'] not in FR and p['club_id'] not in SEL and not CAT.search(p['club_id'])]
idx = collections.defaultdict(list)
for p in Lp:
    for t in toks(p['full_name']): idx[t].append(p)
out = []
for f in FRp:
    tf = toks(f['full_name'])
    if len(tf) < 2 or not inm.get(f['id']): continue
    cands = {}
    for t in tf:
        for p in idx[t]:
            tp = toks(p['full_name'])
            if len(tp) >= 2 and tp != tf and (tp < tf or tf < tp) and min(len(tp), len(tf)) >= 2:
                cands[p['id']] = p
    for p in cands.values():
        tog = bool(inm.get(f['id'], set()) & inm.get(p['id'], set()))
        out.append((f, p, tog))
print(len(out))
for f, p, tog in sorted(out, key=lambda x: x[1]['full_name']):
    rf = clubs[f['club_id']].get('region') or f['club_id']
    print(f"{f['club_id']:18} {f['full_name']:32} <-> {p['club_id']:32} {p['full_name']:36} reg: {rf}|{reg.get(p['club_id'])} juntos={tog} usosL={len(inm.get(p['id'],()))}")
json.dump([(f['id'], p['id'], tog) for f, p, tog in out], open('subset_cross.json', 'w'))
