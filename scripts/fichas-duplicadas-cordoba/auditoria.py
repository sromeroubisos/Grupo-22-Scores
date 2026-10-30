"""Auditoría de solo lectura de nombres y uso de fichas en Córdoba. Reusa la carga de plan2.py."""
import collections, re
src = open('plan2.py', encoding='utf-8').read().split('# ── aristas')[0]
g = {'__file__': 'plan2.py'}
exec(compile(src, 'p', 'exec'), g)
people, cba, uses, in_match, matches = g['people'], g['cba'], g['uses'], g['in_match'], g['matches']
fold, toks, lev, strip_suffix = g['fold'], g['toks'], g['lev'], g['strip_suffix']

print('fichas', len(people), 'partidos con formación', len(matches))
def show(t, rows, n=40):
    print(f'\n## {t}: {len(rows)}')
    for r in rows[:n]: print('  ', r)

nm = lambda p: f"{p['club_id']} | {p['full_name']} | usos={uses.get(p['id'],0)}"
P = list(people.values())
show('con coma', [nm(p) for p in P if ',' in p['full_name']])
show('con dígito', [nm(p) for p in P if re.search(r'\d', p['full_name'])])
show('con sufijo', [nm(p) for p in P if ' · ' in p['full_name']])
show('inicial final', [nm(p) for p in P if re.search(r' [A-Za-z]\.?$', p['full_name'])])
show('una palabra', [nm(p) for p in P if ' ' not in p['full_name'].strip()])
show('MAYÚSCULAS', [nm(p) for p in P if p['full_name'] == p['full_name'].upper() and re.search('[A-Z]{3}', p['full_name'])])
show('OCR sospechoso (Lg/Ilg/ rn)', [nm(p) for p in P if re.search(r'\b(Lg|Ilg|Lgn)\w*', p['full_name'])])
show('nombre con doble espacio o espacios al borde', [nm(p) for p in P if p['full_name'] != ' '.join(p['full_name'].split())])

# orphans en formaciones
ids = set(people)
allp = set()
orph = collections.Counter(); namemis = []
for m in matches:
    for side in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(side) or []):
            pid = e.get('id')
            if pid and pid not in ids: allp.add(pid)
            if pid in people and e.get('name') and e['name'] != people[pid]['full_name']:
                namemis.append((m['id'][:8], e['name'], people[pid]['full_name']))
print('\n## ids de formación fuera del set de Córdoba (otros clubes o borrados):', len(allp))
show('nombre en formación != ficha', namemis)

# near-dups más laxos (pueden jugar juntos = hermanos; solo informativo)
by = collections.defaultdict(list)
for p in P: by[p['club_id']].append(p)
near = []
for club, ps in by.items():
    for i, a in enumerate(ps):
        ta = toks(a['full_name'])
        for b in ps[i+1:]:
            tb = toks(b['full_name'])
            if not ta or not tb: continue
            ka, kb = ' '.join(ta), ' '.join(tb)
            if ka == kb or (len(ka) >= 8 and lev(ka, kb) <= 2):
                tog = bool(in_match.get(a['id'], set()) & in_match.get(b['id'], set()))
                near.append(f"{club} | {a['full_name']}({uses.get(a['id'],0)}) ~ {b['full_name']}({uses.get(b['id'],0)}) juntos={tog}")
show('pares casi iguales que quedan', near, 60)
