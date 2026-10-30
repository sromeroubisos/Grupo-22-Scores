"""Export de tarjetas de la UCR (txt 'Torneo T. REGION CENTRO (PRIMERA)') -> JSON de ficha-partido-local.ts.

Uso: python build.py "<txt>" <salida.json>
Cada tarjeta se parsea por tabuladores; la tarjeta repetida (mismo numero) se descarta.
El cruce con la base va fijo en MAPA (tarjeta -> id de matches), verificado a mano.
"""
import json
import re
import sys

MAPA = {
    '327338': ('4bacc6ba-6348-4c0e-ae75-07b92ec6f7f8', 'Urú Curé vs Universitario · M17 A semifinal · tarjeta 327338'),
    '327344': ('b0d166ca-68af-475f-adb2-9e678250c051', 'Palermo Bajo vs Córdoba Athletic · M16 A 3er puesto · tarjeta 327344'),
    '327352': ('65a53217-4185-4cb9-9cb9-b377a909f1b6', 'Combinado Capital vs Buitres/S. Basilio/Mackenna/Mirage · Desarrollo M2 Plata F4 · tarjeta 327352'),
    '326218': ('40733327-224b-4746-9333-5f1c117fce78', 'Villa General Belgrano vs Unión Oncativo · Liga Desarrollo Copa Oro F3 · tarjeta 326218'),
    '327335': ('aff23241-b492-4aea-bd69-0433157716de', 'Córdoba Athletic B vs Córdoba RC · M19 B 5to puesto · tarjeta 327335'),
}
TIPOS = [('try penal', 'penalty_try'), ('try', 'try'), ('conv', 'conversion'), ('penal', 'penalty_goal'), ('drop', 'drop_goal'),
         ('amar', 'card_yellow'), ('roja', 'card_red'), ('se ret', 'out'), ('ingres', 'in'), ('lesion', 'injury'), ('conmo', 'concussion')]


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


def main():
    txt, dst = sys.argv[1], sys.argv[2]
    raw = open(txt, encoding='utf-8-sig').read().replace('\r', '')
    cards = re.split(r'(?=Torneo : )', raw)
    vistos, partidos = set(), []
    for c in cards:
        if not c.strip(): continue
        num, inc, ros = parse_card(c.split('\n'))
        if num in vistos or num not in MAPA: continue
        vistos.add(num)
        mid, rot = MAPA[num]
        p = {'id': mid, 'rotulo': rot, 'local': lado(ros['L']), 'visitante': lado(ros['V']), 'eventos': []}
        for k, side, ro in (('L', 'local', ros['L']), ('V', 'visitante', ros['V'])):
            ev, av = eventos(inc[k], ro)
            for e in ev: e['equipo'] = side
            p['eventos'] += ev
            for a in av: print(num, side, a)
        p['eventos'].sort(key=lambda e: (e['periodo'], e['minuto']))
        partidos.append(p)
        print(num, len(p['local']['titulares']) + len(p['local']['suplentes']), len(p['visitante']['titulares']) + len(p['visitante']['suplentes']), len(p['eventos']))
    json.dump({'descripcion': 'CBA 2 · tarjetas UCR 22-25/10 (M17 A semi, M16 A 3er puesto, Desarrollo M2 Plata, Copa Oro Desarrollo, M19 B 5to)', 'partidos': partidos},
              open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


main()
