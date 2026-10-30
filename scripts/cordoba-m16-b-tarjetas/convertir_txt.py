"""Tarjetas de partido del Torneo Bloque Juvenil M16 "B" (texto copiado del SIGER, .txt) -> cards.raw.json.

Uso:  python convertir_txt.py "<archivo.txt>"
Misma forma que escribe scripts/interior-tarjetas/parse.py, asi build.py las consume igual. A diferencia de
las tarjetas OCR, el texto trae el nombre del jugador en cada incidencia: se traduce a dorsal con el plantel
(el dorsal de la planilla es la posicion 1-23).
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
from parse import tipo_incidencia  # noqa: E402
import build  # noqa: E402

SCORE = re.compile(r'^(\d+|-)(?:\s*\[\d+\])?$')


def tipo_de(txt):
    t = txt.lower()
    if t.startswith('posible conmo'):
        return 'concussion'
    return tipo_incidencia(txt)


def parsear(bloque):
    ls = [l.rstrip('\r') for l in bloque.split('\n')]
    num = next(re.match(r'Partido n\S+ : (\d+)', l)[1] for l in ls if l.startswith('Partido n'))
    m = re.search(r'(\d\d)/(\d\d)/(\d{4})(?: (\d\d:\d\d))?',next(l for l in ls if l.startswith('Fecha de juego')))
    ref = next(l for l in ls if l.startswith('Referee')).split(':', 1)[1].strip()
    arbitro = None if ref.startswith('(') or not ref else build.nombre_limpio(ref)
    inst = next(l for l in ls if l.startswith('Fecha :')).split(':', 1)[1].strip()
    # marcador y nombres: dos pares "puntos [bonus]" / "nombre" separados por "-"
    i0 = next(i for i, l in enumerate(ls) if l.startswith('Partido número') or l.startswith('Referee'))
    pares = []
    for i in range(i0, len(ls) - 1):
        if SCORE.match(ls[i].strip()) and ls[i + 1].strip() and not SCORE.match(ls[i + 1].strip()):
            g = SCORE.match(ls[i].strip())[1]
            pares.append((int(g) if g.isdigit() else None, ls[i + 1].strip()))
            if len(pares) == 2:
                break
    (sl, nl), (sv, nv) = pares
    # secciones
    def idx(prefijo, desde=0):
        return next((i for i in range(desde, len(ls)) if ls[i].startswith(prefijo)), None)
    iil, iiv = idx('Incidencias LOCAL'), idx('Incidencias VISITANTE')
    iel, iev = idx('Entrenador LOCAL'), idx('Entrenador VISITANTE')
    ifin = idx('Incidencias PARTIDO')

    def filas_inc(a, b):
        out = []
        for l in ls[a + 2:b]:
            p = l.split('\t')
            if len(p) >= 4 and p[0].strip() in ('1T', '2T', 'ET'):
                out.append(p + [''] * (8 - len(p)))
        return out

    def plantel(a, b):
        out = []
        for l in ls[a:b]:
            p = l.split('\t')
            if len(p) >= 3 and p[0].isdigit() and p[1].isdigit():
                out.append({'pos': int(p[0]), 'dor': int(p[0]), 'nombre': p[2].strip(), 'doc': p[1]})
        return out

    pl = [plantel(iel, iev), plantel(iev, ifin)]
    inc = {'local': [], 'visitante': []}
    avisos = []
    for lado, (a, b), roster in (('local', (iil, iiv), pl[0]), ('visitante', (iiv, iel), pl[1])):
        por_nombre = {build.plegar(j['nombre']): j['dor'] for j in roster}
        for p in filas_inc(a, b):
            per, minuto, _, texto, pun, jug, detalle, sancion = p[:8]
            tipo = tipo_de(texto)
            if not tipo:
                avisos.append(f'{num}: incidencia sin tipo {texto!r}')
                continue
            pref = re.match(r'^(\d+) - (.+)$', jug.strip())
            dor = int(pref[1]) if pref else por_nombre.get(build.plegar(jug.strip()))
            if pref:
                jug = pref[2]
            if jug.strip() and dor is None:
                avisos.append(f'{num}: jugador {jug!r} no esta en el plantel ({texto})')
            if tipo in ('try', 'conversion', 'penalty_goal', 'drop_goal'):
                nums = [int(pun)] + ([dor] if dor is not None else []) if pun.strip().isdigit() else ([dor] if dor else [])
            elif tipo == 'penalty_try':
                nums = [7]
            else:
                nums = [dor] if dor is not None else []
            m_ = minuto.strip()
            inc[lado].append({'per': per.strip(), 'min': int(m_) if m_.isdigit() else None, 'minRaw': m_, 'tipo': tipo,
                              'nums': nums, 'obs': (detalle + ' ' + sancion).strip(),
                              'raw': f'{per} {minuto} {texto} {pun} {jug}'})
    return {'archivo': num, 'numero': num, 'fecha': f'{m[3]}-{m[2]}-{m[1]}', 'hora': m[4], 'instancia': inst,
            'cancha': None, 'local': {'nombre': nl, 'score': sl}, 'visitante': {'nombre': nv, 'score': sv},
            'arbitro': arbitro, 'plantel': pl, 'inc': inc}, avisos


def main():
    txt = open(sys.argv[1], encoding='utf-8-sig').read().replace('\r', '')
    bloques = [b for b in re.split(r'(?=^Torneo : )', txt, flags=re.M) if b.startswith('Torneo : ')]
    cards, avisos, nombres = [], [], set()
    for b in bloques:
        c, a = parsear(b)
        if c['local']['score'] is None or c['visitante']['score'] is None:
            avisos.append(f'{c["numero"]}: sin marcador (no jugado), se omite')
            continue
        cards.append(c)
        avisos += a
        nombres |= {c['local']['nombre'], c['visitante']['nombre']}
        if any(len(x) not in (0, 23) and len(x) < 15 for x in c['plantel']):
            avisos.append(f'{c["numero"]}: plantel raro {[len(x) for x in c["plantel"]]}')
    with open(os.path.join(AQUI, 'cards.m16b.raw.json'), 'w', encoding='utf8') as fh:
        json.dump(cards, fh, ensure_ascii=False, indent=1)
    print(len(cards), 'tarjetas ·', len({c['numero'] for c in cards}), 'numeros distintos')
    print('\n'.join(sorted(nombres)))
    print('\n'.join(avisos[:60]), len(avisos), 'avisos')


if __name__ == '__main__':
    main()
