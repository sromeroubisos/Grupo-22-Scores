"""Tarjetas UAR (txt NEA 2026 + NOA A 2026) -> JSON de ficha-partido-local.ts.

Uso: python build.py "<txt>" <prefijo-salida>
El cruce con la base es automatico: fecha de juego + clubes (db_estado.json). Si el marcador
de la tarjeta no es el de la base, el partido se informa y NO sale sin 'permitirDiferencia'.
"""
import json, re, sys, os, unicodedata
from collections import defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cuyano-top8-2026'))
from dbfetch import get as rest

AQUI = os.path.dirname(os.path.abspath(__file__))
class _Id(dict):
    def __missing__(self, k): return k
CLUBES = _Id()  # a_txt.mjs ya escribe el id de club de G22 en cada tarjeta
TORNEOS = {k: k for k in ('trpc', 'apertura', 'clausura', 'austral', 'cordillerano', 'mayores', 'primerab', 'norpat')}
PUNTOS = {'penalty_try': 7, 'try': 5, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}

TIPOS = [('try penal', 'penalty_try'), ('try', 'try'), ('conv', 'conversion'), ('penal', 'penalty_goal'), ('drop', 'drop_goal'),
         ('amar', 'card_yellow'), ('roja', 'card_red'), ('se ret', 'out'), ('ingres', 'in'), ('lesion', 'injury'), ('conmo', 'concussion'), ('tarjeta azul', 'blue')]


def nombre(raw):
    raw = re.sub(r'^\d+\s*-\s*', '', raw.strip())
    if ',' in raw:
        ap, no = [x.strip() for x in raw.split(',', 1)]
        return f'{no} {ap}'.strip()
    return raw


def tipo(txt):
    t = txt.lower()
    for k, v in TIPOS:
        if t.startswith(k):
            return v
    raise ValueError(txt)


def score(i, o, ros):
    pi, po = ros[i], ros[o]
    if pi[0] == po[0]:
        return 3
    if pi[0] in po[1:]:
        return 2
    return 1 if set(pi) & set(po) else 0


def parse_card(lines):
    num = next(re.search(r'(\d+)', l).group(1) for l in lines if l.startswith('Partido número'))
    sec, inc, ros = None, {'L': [], 'V': []}, {'L': [], 'V': []}
    for l in lines:
        if l.startswith('Incidencias LOCAL'): sec = ('i', 'L'); continue
        if l.startswith('Incidencias VISITANTE'): sec = ('i', 'V'); continue
        if l.startswith('Miembros del equipo LOCAL'): sec = ('r', 'L'); continue
        if l.startswith('Miembros del equipo VISITANTE'): sec = ('r', 'V'); continue
        if l.startswith('Incidencias PARTIDO'): sec = None
        if not sec: continue
        f = l.split('\t')
        if sec[0] == 'i' and len(f) >= 6 and re.match(r'^(1T|2T|ET)$', f[0]):
            inc[sec[1]].append(f)
        if sec[0] == 'r' and len(f) >= 9 and f[0].isdigit() and f[1].isdigit():
            ros[sec[1]].append(f)
    return num, inc, ros


def lado(rosr):
    tit = [{'numero': int(r[0]), 'nombre': nombre(r[2])} for r in rosr if int(r[0]) <= 15]
    sup = [{'numero': int(r[0]), 'nombre': nombre(r[2])} for r in rosr if int(r[0]) > 15]
    return {'titulares': tit, 'suplentes': sup}


def eventos(incs, rosr):
    pos = {nombre(r[2]): [p for p in r[5:8] if p.isdigit()] or ['99'] for r in rosr}
    out, pend_o, pend_i, avisos = [], [], [], []
    grupos = []
    for f in incs:
        per = '1T' if f[0] == '1T' else '2T'
        mi = int(f[1]) if f[0] != 'ET' else 40
        grupos.append((per, mi, f))
    for per, mi, f in grupos:
        t = tipo(f[3]); j = nombre(f[5]) if f[5].strip() else ''
        d = f[6].strip() if len(f) > 6 else ''
        if t == 'out': pend_o.append((len(out), per, mi, j)); out.append(None); continue
        if t == 'in': pend_i.append((len(out), per, mi, j)); out.append(None); continue
        if t == 'concussion': t, d = 'injury', 'Conmoción cerebral'
        elif t == 'blue': t, d = 'injury', 'Tarjeta azul' + (' · ' + d if d else '')
        elif t == 'injury': d = d or 'Lesionado'
        if t == 'injury' and f[3].lower().startswith('lesion'): pend_o.append((-1, per, mi, j))  # el lesionado sale: su cambio no trae 'Se retiró'
        elif t.startswith('card'): d = ''
        e = {'minuto': mi, 'periodo': per, 'tipo': t, 'jugador': j}
        if d: e['detalle'] = d
        out.append(e)
    # emparejar salidas con ingresos por afinidad de puesto
    while pend_o and pend_i:
        best = max(((score(i[3], o[3], pos), -abs(i[2] - o[2]), -(abs(i[0] - o[0])), oi, ii)
                    for oi, o in enumerate(pend_o) for ii, i in enumerate(pend_i)), key=lambda x: x[:3])
        _, _, _, oi, ii = best
        o, i = pend_o.pop(oi), pend_i.pop(ii)
        idx, per, mi = max(o, i, key=lambda z: z[0])[0], i[1], max(o[2], i[2])
        out[idx] = {'minuto': mi, 'periodo': per, 'tipo': 'substitution', 'jugador': o[3], 'detalle': f'Entra: {i[3]}'}
    for x in pend_o + pend_i:
        avisos.append(f'sin pareja: {x}')
    return [e for e in out if e], avisos



def cabecera(lines):
    """(fecha dd/mm/yyyy, referee, local, visitante, marcador local, marcador visitante, estado)"""
    fecha = next(re.search(r'(\d\d/\d\d/\d{4})', l).group(1) for l in lines if l.startswith('Fecha de juego'))
    ref = next((l.split(':', 1)[1].strip() for l in lines if l.startswith('Referee')), '')
    estado = next((l.strip() for l in lines if l.strip() in ('Cerrado', 'Iniciado', 'Abierto', 'Pendiente')), '?')
    nombres, puntos = [], []
    for i, l in enumerate(lines):
        if l.strip().startswith('CONFIRMADO') or l.strip() == 'SIN CONFIRMAR':
            nombres.append(lines[i - 1].strip()); puntos.append(int(re.match(r'(\d+)', lines[i - 2].strip()).group(1)))
    return fecha, ref, nombres[0], nombres[1], puntos[0], puntos[1], estado


def arbitro(ref):
    if ',' in ref:
        ap, no = [x.strip() for x in ref.split(',', 1)]
        return f'{no} {ap}'.upper()
    return ref.upper()


def plegar(n):
    t = unicodedata.normalize('NFD', n or '')
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9 ]', '', t).split()


_PERS, _USO = {}, {}


def personas(club):
    if club not in _PERS:
        filas, off = [], 0
        while True:
            r = rest(f'people?club_id=eq.{club}&select=id,full_name&order=id&limit=1000&offset={off}')
            filas += r
            if len(r) < 1000: break
            off += 1000
        _PERS[club] = filas
        uso = defaultdict(int)
        for m in rest(f'matches?select=lineups,home_club_id,away_club_id&or=(home_club_id.eq.{club},away_club_id.eq.{club})&or=(lineup_home_count.gt.0,lineup_away_count.gt.0)&limit=1000'):
            lado = 'home' if m['home_club_id'] == club else 'away'
            for j in ((m.get('lineups') or {}).get(lado) or []):
                if j.get('id'): uso[j['id']] += 1
        _USO[club] = uso
    return _PERS[club], _USO[club]


def subsecuencia(corto, largo):
    it = iter(largo)
    return all(t in it for t in corto)


def fijar_ids(jugadores, club):
    filas, uso = personas(club)
    ok = nuevos = 0
    dudosos = []
    for j in jugadores:
        n = plegar(j['nombre'])
        exacto = [p for p in filas if plegar(p['full_name']) == n]
        cand = exacto
        if not cand and len(n) >= 2:
            cand = [p for p in filas if (lambda q: len(q) >= 2 and q[0] == n[0] and q[-1] in n[1:] and subsecuencia(q, n))(plegar(p['full_name']))]
        if not cand:
            nuevos += 1; continue
        cand = sorted(cand, key=lambda p: (-uso.get(p['id'], 0), p['full_name'] != j['nombre'], p['id']))
        if not exacto and len(cand) > 1: dudosos.append((j['nombre'], [c['full_name'] for c in cand]))
        j['id'] = cand[0]['id']; ok += 1
    return ok, nuevos, dudosos


def main():
    txt, dst = sys.argv[1], sys.argv[2]
    raw = open(txt, encoding='utf-8-sig').read().replace(chr(13), '')
    dbs = json.load(open(os.path.join(AQUI, 'db_estado.json'), encoding='utf8'))
    cards = re.split(r'(?=Torneo : )', raw)
    vistos, salida, problemas = set(), {k: [] for k in TORNEOS}, []
    for c in cards:
        if not c.strip(): continue
        lines = c.split(chr(10))
        for _i, _l in enumerate(lines):
            if _l.startswith('Incidencias PARTIDO'): lines = lines[:_i + 1]; break  # alguna tarjeta viene pegada dos veces
        tn = lines[0].split(':', 1)[1].strip()
        if tn not in TORNEOS: problemas.append(f'torneo desconocido {tn}'); continue
        key = TORNEOS[tn]
        num, inc, ros = parse_card(lines)
        if num in vistos: continue
        vistos.add(num)
        try:
            fecha, ref, nl, nv, pl, pv, estado = cabecera(lines)
        except AttributeError:
            problemas.append(f'{key} {num}: tarjeta sin marcador (partido en juego o sin cerrar), se omite'); continue
        cl, cv = CLUBES[nl], CLUBES[nv]
        d, m, y = fecha.split('/')
        cand = [x for x in dbs[key] if x['home_club_id'] == cl and x['away_club_id'] == cv and x['date_time'].startswith(f'{y}-{m}-{d}')]
        if len(cand) != 1:
            cand = [x for x in dbs[key] if x['home_club_id'] == cl and x['away_club_id'] == cv and abs((__import__('datetime').date.fromisoformat(x['date_time'][:10]) - __import__('datetime').date(int(y), int(m), int(d))).days) <= 1]
        swap = False
        if len(cand) != 1:
            cand = [x for x in dbs[key] if x['home_club_id'] == cv and x['away_club_id'] == cl and x['date_time'].startswith(f'{y}-{m}-{d}')]
            swap = len(cand) == 1
        if len(cand) != 1:
            cand = [x for x in dbs[key] if {x['home_club_id'], x['away_club_id']} == {cl, cv} and x['date_time'].startswith(f'{y}-{d}-{m}')]
            swap = len(cand) == 1 and cand[0]['home_club_id'] != cl
        if len(cand) != 1:
            problemas.append(f'{key} {num}: {len(cand)} candidatos en la base para {cl}-{cv} {fecha}'); continue
        mid = cand[0]['id']
        rot = f'{cl} vs {cv} · {key.upper()} 2026 · tarjeta {num}'
        if not ros['L'] and not ros['V']:
            problemas.append(f'{key} {num}: tarjeta sin planteles ni marcador, se omite'); continue
        p = {'id': mid, 'rotulo': rot, 'arbitro': arbitro(ref), 'local': {**lado(ros['L']), 'nombre': cl},
             'visitante': {**lado(ros['V']), 'nombre': cv}, 'eventos': []}
        avisos_p = []
        for side, club in (('local', cl), ('visitante', cv)):
            ok, nu, du = fijar_ids(p[side]['titulares'] + p[side]['suplentes'], club)
            avisos_p.append(f'{side}: fichas {ok} nuevas {nu}')
            for x in du: print('   DUDOSO', x)
        for k, side, ro in (('L', 'local', ros['L']), ('V', 'visitante', ros['V'])):
            ev, av = eventos(inc[k], ro)
            for e in ev: e['equipo'] = side
            p['eventos'] += ev
            avisos_p += [f'{side}: {a}' for a in av]
        p['eventos'].sort(key=lambda e: (e['periodo'], e['minuto']))
        suma = {'local': 0, 'visitante': 0}
        for e in p['eventos']:
            suma[e['equipo']] += PUNTOS.get(e['tipo'], 0)
        gb = cand[0]['score'] or {}
        if swap:
            p['local'], p['visitante'] = p['visitante'], p['local']
            for e in p['eventos']: e['equipo'] = 'visitante' if e['equipo'] == 'local' else 'local'
            suma = {'local': suma['visitante'], 'visitante': suma['local']}
            avisos_p.append('LOCAL/VISITANTE INVERTIDOS respecto de la base')
        print(key, num, estado, f'{cl} {pl}-{pv} {cv}', 'eventos', suma['local'], suma['visitante'], 'base', gb.get('home'), gb.get('away'),
              'nL', len(p['local']['titulares']) + len(p['local']['suplentes']), 'nV', len(p['visitante']['titulares']) + len(p['visitante']['suplentes']), *avisos_p)
        if (suma['local'], suma['visitante']) != (gb.get('home'), gb.get('away')):
            problemas.append(f'{key} {num} {rot}: eventos {suma["local"]}-{suma["visitante"]} / tarjeta {pl}-{pv} / base {gb.get("home")}-{gb.get("away")}')
            p['_difiere'] = True
            if not os.environ.get('CON_EVENTOS'): p['eventos'] = []  # el marcador de la tarjeta no es el de la base: lineups si, eventos no
        salida[key].append(p)
    for x in problemas: print('PROBLEMA', x)
    for key, ps in salida.items():
        json.dump({'descripcion': f'{key.upper()} 2026 · tarjetas oficiales (TRPC)', 'partidos': ps}, open(f'{dst}-{key}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(key, len(ps), 'partidos')


main()
