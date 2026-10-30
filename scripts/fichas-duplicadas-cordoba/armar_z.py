import json, re, unicodedata, collections
src = open('plan_cross.py', encoding='utf-8').read().split("grp = collections.defaultdict(list)")[0]
g = {'__file__': 'plan_cross.py'}; exec(compile(src, 'pc', 'exec'), g)
allp, fold, strip_suffix = g['allp'], g['fold'], g['strip_suffix']
P = [  # (club franquicia/selección, nombre, club local)
 ('tarucas','Estanislao Pregot','jockey-club-salta'),('tarucas','Joaquín Aguilar','tucuman-rugby-club'),('tarucas','Pablo Pfister','tucuman-rugby-club'),
 ('tarucas','Máximo Ledesma','natacion-y-gimnasia'),('tarucas','Miguel Mukdise','tucuman-lawn-tennis'),('tarucas','Nicolás Macome','tucuman-rugby-club'),
 ('tarucas','Santiago Heredia','tucuman-rugby-club'),('tarucas','Lorenzo Matias Egea','santiago-lawn-tennis-club'),
 ('capibaras-xv','Ignacio Palillo Neri','gimnasia-y-esgrima-de-rosario'),('capibaras-xv','Jorge Manuel Onorato Barrientos','universitario-de-santa-fe'),
 ('dogos-xv','Mateo Sánchez','cordoba-athletic-club'),('dogos-xv','Ramiro Iglesias','club-universitario-de-cordoba'),
 ('pampas','Faustino Santarelli Castex','club-newman'),('pampas','Juan Corso','regatas-de-bella-vista'),('pampas','Ramiro Berardi Calvo','los-tilos'),
 ('paraguay','Diego Miño','curda'),('yacare-xv','Estefano Aranda','curda'),('paraguay','Facundo Paiva','curda'),('paraguay','Francisco Bareiro','san-jose'),
 ('paraguay','Joaquín Mussi','curda'),('paraguay','Enrique Quinteros','san-jose'),('paraguay','Marcello Fretes','san-jose'),('paraguay','Nahuel Kacerosky','san-jose'),
 ('yacare-xv','Rafael Bareiro','san-jose'),('yacare-xv','Rodolfo Rivadeneira','san-jose'),('paraguay','Thomás Guzmán','san-jose'),
 ('argentina-m20','Bautista Salinas Mealla','los-tordos-rugby-club'),('argentina-xv','Bautista Salinas Mallea','los-tordos-rugby-club'),
 ('argentina-m20','Benjamín Farías Cerioni','jockey-club-de-villa-maria'),('argentina-m20','Manuel Cuneo Camargo','san-juan-rugby-club'),
 ('argentina-m20','Nicolás Cambiasso','buenos-aires-crc'),('argentina-m20','Ramón Fernández','hindu-club'),('argentina-xv','Simón Pfister','tucuman-rugby-club'),
 ('argentina-m20','SIMÓN PFISTER','tucuman-rugby-club'),('argentina','Nicolás Roger','club-la-tablada')]
by = {(p['club_id'], p['full_name']): p for p in allp}
def key(s): return ' '.join(sorted(fold(strip_suffix(s)).split()))
loc_by_club = collections.defaultdict(list)
for p in allp: loc_by_club[p['club_id']].append(p)
grupos = collections.defaultdict(lambda: {'loc': None, 'fr': []}); faltan = []
for fc, fn_, lc in P:
    f = by.get((fc, fn_))
    if not f: faltan.append((fc, fn_)); continue
    tf = set(key(f['full_name']).split())
    cand = [p for p in loc_by_club[lc] if (lambda tp: len(tp) >= 2 and (tp < tf or tf < tp or tp == tf))(set(key(p['full_name']).split()))]
    if len(cand) != 1: faltan.append((fc, fn_, lc, [c['full_name'] for c in cand])); continue
    grupos[cand[0]['id']]['loc'] = cand[0]; grupos[cand[0]['id']]['fr'].append(f)
print('no resueltos:', faltan)
def mejor_nombre(ms):
    toks = {}
    for p in ms:
        for w in strip_suffix(p['full_name']).split():
            toks.setdefault(fold(w), set()).add(w)
    def acc(c): return sum(1 for ch in unicodedata.normalize('NFD', c) if unicodedata.category(ch) == 'Mn')
    base = max(ms, key=lambda p: len(key(p['full_name']).split()))['full_name']
    out = []
    for w in base.split():
        opts = toks.get(fold(w), {w}); w2 = max(opts, key=lambda c: (acc(c), c != c.upper()))
        out.append(w2.capitalize() if w2 == w2.upper() and len(w2) > 1 else w2)
    return ' '.join(out)
plan = []
for lid, gr in grupos.items():
    ms = [gr['loc']] + gr['fr']; nombre = mejor_nombre(ms)
    if nombre == 'Juan Cruzo Corso': nombre = 'Juan Cruz Corso'
    plan.append({'club_id': gr['loc']['club_id'], 'por': ['sub'], 'nombre': nombre, 'keep': lid, 'first': None, 'last': None,
                 'fichas': [{'id': p['id'], 'full_name': p['full_name'], 'club': p['club_id'], 'usos': 0, 'nombres': {}, 'dni': []} for p in ms],
                 'borrar': [p['id'] for p in gr['fr']]})
    print(nombre, '<-', [(p['club_id'], p['full_name']) for p in gr['fr']], '=>', gr['loc']['club_id'])
json.dump({'plan': plan, 'conflictos': []}, open('plan.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
