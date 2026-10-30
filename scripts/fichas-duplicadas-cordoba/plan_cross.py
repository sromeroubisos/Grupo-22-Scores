"""Unifica jugadores de franquicias SRA con su ficha de selección/club local. Escribe plan_cross.json + informe_cross.txt. Solo lectura."""
import json, re, collections, unicodedata
src = open('plan2.py', encoding='utf-8').read().split('# ── clubes de Córdoba')[0]
g = {'__file__': 'plan2.py'}
exec(compile(src, 'p', 'exec'), g)
get_all, fold, strip_suffix = g['get_all'], g['fold'], g['strip_suffix']
FR = {'pampas': 'ar', 'dogos-xv': 'ar', 'tarucas': 'ar', 'capibaras-xv': 'ar', 'penarol': 'uy', 'selknam': 'cl', 'academia-selknam': 'cl', 'yacare-xv': 'py',
      'cobras-brasil-xv': 'br', 'jaguares-xv': 'ar', 'american-raptors': 'us', 'cafeteros-pro': 'co', 'los-ceibos': 'ar'}
SEL = {'argentina-xv': 'ar', 'argentina-m20': 'ar', 'argentina': 'ar', 'chile-xv': 'cl', 'chile-u20': 'cl', 'uruguay-xv': 'uy', 'uruguay-u20': 'uy', 'paraguay': 'py'}
CAT = re.compile(r'-(intermedia|preintermedia.*|m\d\d(-[a-c])?|caballeros|a|b|c)$')
allp = get_all('people', {'select': 'id,club_id,full_name,first_name,last_name'})
clubs = {c['id']: c for c in get_all('clubs', {'select': 'id,country,union_id'})}
def ctry(club):
    t = (clubs.get(club, {}).get('country') or '').lower()
    if t in ('', 'arg', 'argentina'): return 'ar'
    for k, v in (('argent', 'ar'), ('urug', 'uy'), ('chil', 'cl'), ('parag', 'py'), ('bras', 'br'), ('usa', 'us'), ('estados', 'us'), ('colomb', 'co')):
        if k in t: return v
    return None
print('países de clubes locales:', collections.Counter(clubs[c]['country'] for c in clubs if c not in FR and c not in SEL).most_common(8))
key = lambda s: ' '.join(sorted(fold(strip_suffix(s)).split()))
grp = collections.defaultdict(list)
for p in allp:
    if len(key(p['full_name']).split()) >= 2: grp[key(p['full_name'])].append(p)
ms = []
for pg in range(0, 1): pass
ms = get_all('matches', {'select': 'id,lineups', 'lineup_home_count': 'gt.0'}) + get_all('matches', {'select': 'id,lineups', 'lineup_home_count': 'eq.0', 'lineup_away_count': 'gt.0'})
inm = collections.defaultdict(set)
for m in ms:
    for s in ('home', 'away'):
        for e in ((m.get('lineups') or {}).get(s) or []):
            if e.get('id'): inm[e['id']].add(m['id'])
uses = {k: len(v) for k, v in inm.items()}
plan, amb, parcial = [], [], []
for k, ps in grp.items():
    F = [p for p in ps if p['club_id'] in FR]
    if not F: continue
    S = [p for p in ps if p['club_id'] in SEL]
    L = [p for p in ps if p['club_id'] not in FR and p['club_id'] not in SEL and not CAT.search(p['club_id'])]
    if len({p['club_id'] for p in L}) > 1: amb.append((k, [(p['club_id'], p['full_name']) for p in ps])); continue
    toks = len(k.split())
    if L: main = max(L, key=lambda p: (uses.get(p['id'], 0), p['full_name'] != p['full_name'].upper()))
    elif S: main = max(S, key=lambda p: uses.get(p['id'], 0))
    else: main = max(F, key=lambda p: uses.get(p['id'], 0))
    mc = ctry(main['club_id']) or SEL.get(main['club_id']) or FR.get(main['club_id'])
    miembros = [main]
    for p in L:
        if p['id'] != main['id']: miembros.append(p)
    for p in F + S:
        if p['id'] == main['id']: continue
        pc = FR.get(p['club_id']) or SEL.get(p['club_id'])
        if toks <= 2 and mc and pc and mc != pc: parcial.append((k, p['club_id'], 'país distinto', mc, pc)); continue
        if toks <= 2 and not mc: parcial.append((k, p['club_id'], 'sin país del principal')); continue
        miembros.append(p)
    if len(miembros) < 2: continue
    # nunca fusionar fichas que jugaron el mismo partido
    if any(inm.get(a['id'], set()) & inm.get(b['id'], set()) for i, a in enumerate(miembros) for b in miembros[i+1:]):
        amb.append((k, 'juegan juntos', [(p['club_id'], p['full_name']) for p in miembros])); continue
    tild = lambda s: sum(1 for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) == 'Mn')
    buenos = [p['full_name'] for p in miembros if ',' not in p['full_name'] and p['full_name'] != p['full_name'].upper()]
    nombre = max(buenos or [main['full_name']], key=lambda n: (tild(n), len(n)))
    if nombre != main['full_name']: first = last = None
    else: first, last = main['first_name'], main['last_name']
    plan.append({'club_id': main['club_id'], 'por': ['cross'], 'nombre': nombre, 'keep': main['id'], 'first': first, 'last': last,
                 'fichas': [{'id': p['id'], 'full_name': p['full_name'], 'club': p['club_id'], 'usos': uses.get(p['id'], 0), 'nombres': {}, 'dni': []} for p in miembros],
                 'borrar': [p['id'] for p in miembros if p['id'] != main['id']]})
json.dump({'plan': plan, 'conflictos': []}, open('plan_cross.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open('informe_cross.txt', 'w', encoding='utf-8') as fh:
    fh.write(f'grupos a unificar: {len(plan)} · fichas que sobran: {sum(len(e["borrar"]) for e in plan)} · ambiguos/omitidos: {len(amb)} · miembros descartados por país: {len(parcial)}\n\n')
    for e in sorted(plan, key=lambda e: e['nombre']):
        fh.write(f'{e["nombre"]}  -> principal {e["club_id"]}\n')
        for f_ in e['fichas']: fh.write(f'   {"*" if f_["id"] == e["keep"] else " "} {f_["club"]:32} {f_["usos"]:3} {f_["full_name"]}\n')
    fh.write('\n── AMBIGUOS ──\n')
    for a in amb: fh.write(str(a) + '\n')
    fh.write('\n── DESCARTADOS ──\n')
    for a in parcial: fh.write(str(a) + '\n')
print(open('informe_cross.txt', encoding='utf-8').read()[:200])
print('principal por tipo:', collections.Counter('selección' if e['club_id'] in SEL else 'franquicia' if e['club_id'] in FR else 'local' for e in plan))
