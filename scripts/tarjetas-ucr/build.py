import json, glob, os, re, sys, collections
from parse import parse_card, parse_incidents, norm

PUNTOS = {'try': 5, 'penalty_try': 7, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}


import unicodedata as _ud
def min_from_raw(raw, fallback):
    t = _ud.normalize('NFKC', raw or '')
    t = t.replace('。', '9').replace('：', '8').replace('→', '1')
    s = re.sub(r'\D', '', t)
    if not s: return fallback
    if len(s) <= 2: return int(s)
    if len(s) >= 3:
        s = s[-3:] if len(s) > 3 else s
        a = int(s[:2]); c = int(s[1:])
        if s.endswith('0') and a <= 82: return a
        if int(s[:2]) <= 82 and s[2] != '0' and False: return a
        return c if c <= 82 else a
    return fallback


def motivo(obs):
    f = re.sub(r'\s+', ' ', _ud.normalize('NFKD', obs or '').encode('ascii', 'ignore').decode().lower()).strip()
    if not f: return ''
    f = re.sub(r'ama\w*l\w*a', 'amarilla', f)
    if 'minutos' in f or ('regular' in f and 'sucio' not in f):
        return f.capitalize()
    if 'general' in f or 'j. g' in f or 'j.g' in f: return 'Juego general'
    if 'sucio' in f or 'suc' in f or 'j. s' in f or 'j.s' in f: return 'Juego sucio'
    if 'scrum' in f or '(sc' in f: return 'Scrum'
    if 'lin' in f: return 'Line'
    if 'discip' in f or '(di' in f: return 'Disciplina'
    return (obs or '').strip()

def kind(inc):
    n = norm(inc or '')
    if n.startswith('try') and 'penal' in n: return 'penalty_try'
    if n.startswith('try'): return 'try'
    if n.startswith('conver'): return 'conversion'
    if n.startswith('penal'): return 'penalty_goal'
    if n.startswith('drop'): return 'drop_goal'
    if n.startswith('amarill'): return 'card_yellow'
    if n.startswith('roja'): return 'card_red'
    if 'azul' in n: return 'blue'
    if n.startswith('lesion'): return 'lesion'
    if 'conmoci' in n: return 'conmocion'
    if n.startswith('se retir') or n.startswith('retir'): return 'out'
    if n.startswith('ingres'): return 'in'
    return 'otro:' + n

def group_of(d):
    if d in (1, 2, 3, 16, 17, 18): return 'F'
    if d in (4, 5, 19): return 'L'
    if d in (6, 7, 8, 20): return 'B'
    if d in (9, 21): return 'S'
    if d in (10, 22): return 'O'
    return 'T'  # 11-15, 23

def fix_minutes(rows):
    """El 2T mezcla minutos absolutos y relativos al tiempo. Devuelve minuto relativo al periodo."""
    prev_abs = 0
    last = None
    for e in rows:
        if 'min' not in e:
            if last is not None and not e.get('bad'):
                e['abs'] = last['abs']; e['rel'] = last['rel']; e['min_inferida'] = True
            continue
        m = e['min']
        if e['tiempo'] == '2T':
            a = m + 40 if m < 40 else m
            prev_abs = max(prev_abs, a)
            e['abs'] = a
            e['rel'] = a - 40
            last = e
            continue
        else:
            e['abs'] = m
            e['rel'] = m
        last = e
    return rows

def fix_dor(d, validos):
    if d is None or d in validos: return d
    s = str(d)
    orden = []
    if len(s) >= 2:
        orden += [int(s[1:]), int(s[:-1]), int(re.sub(r'(.)', r'', s))]
        if len(set(s)) == 1: orden.append(int(s[0]))
    for c in orden:
        if c in validos: return c
    return d

def build_side(roster, incs):
    by_dor = {p['dor']: p for p in roster}
    for e in incs:
        if e.get('cell') and e.get('dor') is not None:
            e['dor'] = fix_dor(e['dor'], set(by_dor))
    notes = []
    for e in incs:
        if e.get('cell') and e.get('tiempo') == '1T' and (e.get('min') or 0) > 45:
            e['tiempo'] = '2T'; e['retiempo'] = True
    fix_minutes(incs)
    evs = []
    groups = collections.OrderedDict()
    for e in incs:
        if e.get('bad'):
            notes.append(('fila rara', e['raw']))
            continue
        k = kind(e.get('inc'))
        nums = e.get('nums', [])
        if k in ('try', 'penalty_try', 'conversion', 'penalty_goal', 'drop_goal'):
            pts = None; dor = None
            if e.get('cell'): pts, dor = e.get('ptos'), e.get('dor')
            elif len(nums) >= 2: pts, dor = nums[0], nums[1]
            elif len(nums) == 1: dor = nums[0]
            if pts is not None and pts != PUNTOS[k]:
                notes.append(('puntos raros', k, pts, e['raw']))
            evs.append({'tipo': k, 'tiempo': e['tiempo'], 'abs': e.get('abs'), 'rel': e.get('rel'), 'dor': dor, 'obs': e.get('obs', ''), 'raw': e['raw']})
        elif k in ('card_yellow', 'card_red'):
            dor = e.get('dor') if e.get('cell') else (nums[-1] if nums else None)
            evs.append({'tipo': k, 'tiempo': e['tiempo'], 'abs': e.get('abs'), 'rel': e.get('rel'), 'dor': dor, 'obs': e.get('obs', ''), 'raw': e['raw']})
        elif k in ('blue', 'lesion', 'conmocion', 'out', 'in'):
            dor = e.get('dor') if e.get('cell') else (nums[-1] if nums else None)
            key = (e['tiempo'], e.get('abs'))
            g = groups.setdefault(key, {'outs': [], 'ins': [], 'rel': e.get('rel')})
            rec = {'k': k, 'dor': dor, 'obs': e.get('obs', ''), 'raw': e['raw']}
            if k == 'in': g['ins'].append(rec)
            elif k == 'blue':
                evs.append({'tipo': 'injury', 'tiempo': e['tiempo'], 'abs': e.get('abs'), 'rel': e.get('rel'), 'dor': dor, 'obs': 'Tarjeta azul' + (' · ' + e.get('obs') if e.get('obs') else ''), 'raw': e['raw']})
                g['outs'].append(rec)
            else:
                g['outs'].append(rec)
        else:
            notes.append(('incidencia desconocida', e['raw']))
    sobran_out = []; sobran_in = []
    for (tiempo, ab), g in groups.items():
        ins = list(g['ins'])
        normales = {o['dor'] for o in g['outs'] if o['k'] == 'out'}
        for o in g['outs']:
            if o['k'] in ('lesion', 'conmocion', 'blue') and o['dor'] in normales:
                if o['k'] != 'blue':
                    evs.append({'tipo': 'injury', 'tiempo': tiempo, 'abs': ab, 'rel': g['rel'], 'dor': o['dor'],
                                'obs': ('Conmoción cerebral' if o['k'] == 'conmocion' else 'Lesionado') + (' · ' + o['obs'] if o['obs'] else ''), 'raw': o['raw']})
        g['outs'] = [o for o in g['outs'] if not (o['k'] in ('lesion', 'conmocion', 'blue') and o['dor'] in normales)]
        for o in g['outs']:
            if o['k'] in ('lesion', 'conmocion') :
                evs.append({'tipo': 'injury', 'tiempo': tiempo, 'abs': ab, 'rel': g['rel'], 'dor': o['dor'],
                            'obs': ('Conmoción cerebral' if o['k'] == 'conmocion' else 'Lesionado') + (' · ' + o['obs'] if o['obs'] else ''), 'raw': o['raw']})
            pick = None
            for cand in ins:
                if group_of(cand['dor'] or 0) == group_of(o['dor'] or 0):
                    pick = cand; break
            if pick is None and ins: pick = ins[0]
            if pick:
                ins.remove(pick)
                evs.append({'tipo': 'substitution', 'tiempo': tiempo, 'abs': ab, 'rel': g['rel'], 'dor': o['dor'], 'dor_in': pick['dor'], 'obs': '', 'raw': o['raw'] + pick['raw']})
            else:
                sobran_out.append((tiempo, ab, g['rel'], o))
        for cand in ins:
            sobran_in.append((tiempo, ab, g['rel'], cand))
    # segunda pasada: sobrantes del mismo periodo a <=2 minutos
    for (tf, af, rf, o) in list(sobran_out):
        cands = [c for c in sobran_in if c[0] == tf and c[1] is not None and af is not None and abs(c[1] - af) <= 2]
        if not cands: continue
        comp = [c for c in cands if group_of(c[3]['dor'] or 0) == group_of(o['dor'] or 0)]
        pick = (comp or cands)[0]
        sobran_in.remove(pick); sobran_out.remove((tf, af, rf, o))
        evs.append({'tipo': 'substitution', 'tiempo': tf, 'abs': af, 'rel': rf, 'dor': o['dor'], 'dor_in': pick[3]['dor'], 'obs': '', 'raw': o['raw'] + pick[3]['raw'], 'aprox': True})
    # tercera pasada: lo que sobra en el mismo periodo, por minuto mas cercano
    for (tf, af, rf, o) in list(sobran_out):
        cands = [c for c in sobran_in if c[0] == tf]
        if not cands: continue
        comp = [c for c in cands if group_of(c[3]['dor'] or 0) == group_of(o['dor'] or 0)]
        pool = comp or cands
        pick = min(pool, key=lambda c: abs((c[1] or 0) - (af or 0)))
        sobran_in.remove(pick); sobran_out.remove((tf, af, rf, o))
        evs.append({'tipo': 'substitution', 'tiempo': tf, 'abs': af, 'rel': rf, 'dor': o['dor'], 'dor_in': pick[3]['dor'], 'obs': '', 'raw': o['raw'] + pick[3]['raw'], 'aprox': True})
    # cuarta pasada: el delegado a veces rotula mal el periodo; cruzar si el minuto absoluto coincide (+-3)
    for (tf, af, rf, o) in list(sobran_out):
        cands = [c for c in sobran_in if c[1] is not None and af is not None and abs(c[1] - af) <= 3]
        if not cands: continue
        comp = [c for c in cands if group_of(c[3]['dor'] or 0) == group_of(o['dor'] or 0)]
        pick = min(comp or cands, key=lambda c: abs(c[1] - af))
        sobran_in.remove(pick); sobran_out.remove((tf, af, rf, o))
        evs.append({'tipo': 'substitution', 'tiempo': tf, 'abs': af, 'rel': rf, 'dor': o['dor'], 'dor_in': pick[3]['dor'], 'obs': '', 'raw': o['raw'] + pick[3]['raw'], 'aprox': True})
    for (t_, a_, r_, o) in sobran_out:
        if o['k'] not in ('lesion', 'conmocion', 'blue'): notes.append(('salida sin ingreso', t_, a_, o['dor'], o['k']))
    for (t_, a_, r_, c_) in sobran_in: notes.append(('ingreso sin salida', t_, a_, c_['dor']))
    for e in evs:
        if e['tipo'] in ('card_yellow', 'card_red'): e['obs'] = motivo(e['obs'])
        if e['tipo'] == 'injury' and 'tackle' in (e['obs'] or '').lower():
            e['obs'] = re.sub(r'\s*[.·]\s*TACKLEAD.*$', ' · Tackleador', e['obs'], flags=re.I)
        p = by_dor.get(e['dor'])
        e['jugador'] = p['name'] if p else None
        if e['dor'] is not None and not p: notes.append(('dorsal sin jugador', e['dor'], e['tipo']))
        if e['tipo'] == 'substitution':
            pi = by_dor.get(e['dor_in'])
            e['entra'] = pi['name'] if pi else None
    return evs, notes

def points(evs):
    t = {'tries': 0, 'pts': 0}
    for e in evs:
        t['pts'] += PUNTOS.get(e['tipo'], 0)
        if e['tipo'] in ('try', 'penalty_try'): t['tries'] += 1
    return t

def build_all(raw='ocrraw', p2='ocrp2'):
    cards = []
    for f in sorted(glob.glob(raw + '/*.json')):
        c = parse_card(f)
        cf = 'cellsout/' + os.path.basename(f)
        if os.path.exists(cf):
            cd = json.load(open(cf, encoding='utf-8'))
            c['inc_local'] = []; c['inc_visit'] = []; c['cell_flags'] = []
            for tb in cd['tablas']:
                lado = 'inc_visit' if tb['lado'] == 'visit' else 'inc_local' if tb['lado'] == 'local' else None
                if lado is None:
                    c.setdefault('p2_sin_lado', []).append(tb['title']); continue
                for r in tb['rows']:
                    if not r['inc'] or r['inc'].startswith('otro:inc'): continue
                    et = _ud.normalize('NFKC', r['raw'][0] or '').upper().replace(' ', '') in ('ET', 'E')
                    mn = min_from_raw(r['raw'][1], r['min'])
                    tm = r['tiempo']
                    if et: tm = '2T'; mn = 0
                    c[lado].append({'tiempo': tm, 'min': mn, 'inc': r['inc'], 'ptos': r['ptos'], 'dor': r['dor'], 'obs': r['obs'], 'raw': r['raw'], 'cell': True, 'entretiempo': et})
                c['cell_flags'] += [(tb['lado'],) + tuple(map(str, fl)) for fl in tb['flags'] if fl[0] != 'tie?']
            for lado in ('inc_local', 'inc_visit'):
                filas = c[lado]
                for i, e in enumerate(filas):
                    if e['min'] is None:
                        ant = next((filas[j] for j in range(i - 1, -1, -1) if filas[j]['tiempo'] == e['tiempo'] and filas[j]['min'] is not None), None)
                        sig = next((filas[j] for j in range(i + 1, len(filas)) if filas[j]['tiempo'] == e['tiempo'] and filas[j]['min'] is not None), None)
                        src = ant or sig
                        if src: e['min'] = src['min']; e['min_inferida'] = True
        else:
            c['sin_celdas'] = True
        el, nl = build_side(c['local'], c['inc_local'])
        ev, nv = build_side(c['visit'], c['inc_visit'])
        c['ev_local'] = el; c['ev_visit'] = ev
        c['notes'] = [('L',) + n for n in nl] + [('V',) + n for n in nv]
        pl, pv = points(el), points(ev)
        c['calc'] = [pl['pts'], pv['pts']]
        c['tries'] = [pl['tries'], pv['tries']]
        c['ok_score'] = c.get('score') == c['calc']
        for k in ('top', 'extra_pages', 'inc_local', 'inc_visit'):
            c.pop(k, None)
        cards.append(c)
    return cards

if __name__ == '__main__':
    cards = build_all()
    json.dump(cards, open('cards.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    bad = 0
    for c in cards:
        flag = 'OK ' if c['ok_score'] else 'XX '
        if not c['ok_score']: bad += 1
        print(flag, c['file'].ljust(14), c.get('tarjeta'), c.get('fecha_iso'), c.get('home'), c.get('score'), 'calc', c['calc'], c.get('away'), 'notes', len(c['notes']), 'p2' if not c.get('sin_p2') else 'NOP2')
    print(len(cards), 'tarjetas;', bad, 'con marcador que no cierra')
