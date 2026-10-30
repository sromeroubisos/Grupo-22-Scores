import collections, json
src = open('plan2.py', encoding='utf-8').read().split('# ── aristas')[0]
g = {'__file__': 'plan2.py'}
exec(compile(src, 'p', 'exec'), g)
people, matches, uses, fold = g['people'], g['matches'], g['uses'], g['fold']
seen = collections.defaultdict(collections.Counter)
for m in matches:
    for side in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(side) or []):
            if e.get('id') in people and e.get('name'):
                seen[e['id']][e['name']] += 1
cat = collections.defaultdict(list)
for pid, c in seen.items():
    fn = people[pid]['full_name']
    for name, n in c.items():
        if name == fn: continue
        a, b = fold(name).split(), fold(fn).split()
        if a == b: k = 'solo_tildes'
        elif sorted(a) == sorted(b): k = 'orden_distinto'
        elif set(a) < set(b) or set(b) < set(a): k = 'mas_corto_o_largo'
        else: k = 'otro'
        cat[k].append((people[pid]['club_id'], fn, name, n, uses.get(pid, 0), pid))
for k, v in cat.items(): print(k, len(v))
json.dump(cat, open('nombres_cat.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k in ('orden_distinto', 'otro'):
    print('\n##', k)
    for r in cat[k][:70]: print('  ', r[:5])
