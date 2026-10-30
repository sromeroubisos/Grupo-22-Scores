"""Tarjetas de partido del Torneo del Interior 2026 (texto OCR) -> cards.raw.json.

Uso:  python parse.py "<carpeta1>" "<carpeta2>" ...
Cada archivo es una tarjeta (o una pagina: X_p001.txt / X_p002.txt se juntan).
Lo que sale: por tarjeta, cabecera, 23+23 con dorsal, arbitro e incidencias crudas.
El armado de eventos y el cruce con la base lo hace build.py.
"""
import glob
import json
import os
import re
import sys

GLIFOS = {'B': '8', 'g': '9', 'G': '9', '。': '9', '：': '8', ':': '8', '→': '1', 'O': '0', 'o': '0', 'l': '1', 'I': '1'}


def num(tok):
    """Un token numerico del OCR a int (o None)."""
    t = tok.replace('０', '').strip()
    t = ''.join(GLIFOS.get(c, c) for c in t)
    return int(t) if t.isdigit() else None


def leer(path):
    with open(path, encoding='utf-8-sig') as f:
        return f.read().replace('\r', '')


def tipo_incidencia(txt):
    t = txt.lower()
    if t.startswith('try') and 'pen' in t:
        return 'penalty_try'
    if t.startswith('try'):
        return 'try'
    if t.startswith('conv'):
        return 'conversion'
    if t.startswith('penal'):
        return 'penalty_goal'
    if t.startswith('drop'):
        return 'drop_goal'
    if t.startswith('amar'):
        return 'card_yellow'
    if t.startswith('roja'):
        return 'card_red'
    if t.startswith('se ret'):
        return 'out'
    if t.startswith('ingres'):
        return 'in'
    if t.startswith('lesion'):
        return 'injury'
    if t.startswith('conmo'):
        return 'concussion'
    if t.startswith('tarjeta azul'):
        return 'blue'
    return None


TIPOS_RE = r'(?:Try penal|Try|Conversi\S*|Penal\w*|Drop\w*|Amarilla|Roja|Se ret\S+|Ingres\S+|Lesionad\S+|Conmoci\S+|Tarjeta azul)'
PER_RE = r'(?:[12][TtIl1r]|[Tt]|E[Tt]|El|E1)'
# Inicio de una fila de incidencia: periodo, minuto (cualquier cosa de 1-5 caracteres) y tipo.
FILA = re.compile(r'(?:(?<=^)|(?<=\s))(?P<per>' + PER_RE + r')\s+(?:(?P<min>\S{1,5})\s+)?(?P<tipo>' + TIPOS_RE + r')')


def valida(m):
    """Sin minuto, solo vale un periodo limpio: '11   Amarilla' es un dorsal, no una fila."""
    return bool(m['min']) or m['per'].upper() in ('1T', '2T', 'ET') or m.string[:m.start()].strip() == ''


def partir_filas(ln):
    """Una linea puede traer dos filas (local y visitante lado a lado): [(inicio, texto)]."""
    ms = [m for m in FILA.finditer(ln) if valida(m)]
    cortes = [m.start() for m in ms]
    res = []
    for i, m in enumerate(ms):
        fin = cortes[i + 1] if i + 1 < len(cortes) else len(ln)
        res.append((m.start(), ln[m.start():fin].rstrip()))
    return res


def parse_fila(txt):
    m = FILA.match(txt)
    if not m or not valida(m):
        return None
    tipo = tipo_incidencia(m['tipo'])
    if not tipo:
        return None
    resto = txt[m.end():]
    if tipo == 'concussion':
        resto = re.sub(r'^\s*cerebral', '', resto, flags=re.I)
    toks = resto.split()
    numeros, resto_txt = [], []
    for t in toks:
        n = num(t) if re.fullmatch(r'[0-9gGB。：:→０]+', t) else None
        if n is not None and not resto_txt:
            numeros.append(n)
        else:
            resto_txt.append(t)
    per = m['per'].upper()
    per = {'T': '1T', 'EL': 'ET', 'E1': 'ET', '11': '1T', '1I': '1T', '1L': '1T', '1R': '1T', '2R': '2T', '21': '2T', '2I': '2T', '2L': '2T'}.get(per, per)
    return {'per': per, 'min': num(m['min'] or ''), 'minRaw': m['min'] or '', 'tipo': tipo,
            'nums': numeros, 'obs': ' '.join(resto_txt), 'raw': txt.strip()}


def parse_incidencias(lineas):
    """Filas de una tabla de un solo equipo."""
    out = []
    for ln in lineas:
        for _, t in partir_filas(ln):
            r = parse_fila(t)
            if r:
                out.append(r)
    return out


def parse_lado_a_lado(lineas, col):
    """Cuerpo de una tabla doble (local a la izquierda, visitante a la derecha)."""
    izq, der = [], []
    for ln in lineas:
        for ini, t in partir_filas(ln):
            r = parse_fila(t)
            if not r:
                continue
            (der if ini >= col - 6 else izq).append(r)
    return izq, der


def parse_jugadores(bloque):
    """Tabla de 23: usa la linea de guiones para cortar las columnas."""
    guiones = None
    filas = []
    for i, ln in enumerate(bloque):
        if re.match(r'^-{2,}(\s+-{2,})+', ln):
            guiones = ln
            filas = bloque[i + 1:]
            break
    if guiones is None:
        return []
    spans = [(m.start(), m.end()) for m in re.finditer(r'-+', guiones)]
    res = []
    for ln in filas:
        if not ln.strip():
            break
        ln = ln.ljust(spans[-1][1] + 2)
        pos = num(ln[spans[0][0]:spans[0][1] + 1].strip())
        dor = num(ln[spans[1][0]:spans[1][1] + 1].strip())
        nom = ln[spans[2][0]:spans[3][0]].strip()
        doc = ln[spans[3][0]:spans[3][1] + 1].strip()
        if pos is None or not nom:
            continue
        res.append({'pos': pos, 'dor': dor, 'nombre': nom, 'doc': doc})
    return res


def limpiar_nombre(n):
    """'Apellido, Nombre' -> 'Nombre Apellido'."""
    n = re.sub(r'\s+', ' ', n).strip()
    if ',' in n:
        ap, nom = n.split(',', 1)
        n = f'{nom.strip()} {ap.strip()}'
    palabras = []
    for p in n.split(' '):
        palabras.append(p[:1].upper() + p[1:] if p[:1].islower() and len(p) > 2 else p)
    return ' '.join(palabras)


def parse_tarjeta(texto):
    lineas = texto.split('\n')
    card = {'numero': None, 'fecha': None, 'hora': None, 'instancia': None, 'cancha': None,
            'local': {'nombre': None, 'score': None}, 'visitante': {'nombre': None, 'score': None},
            'arbitro': None}
    m = re.search(r'Tarjeta de partido N\S*:?\s*(\d+)', texto)
    if m:
        card['numero'] = m.group(1)
    cab = 0
    for i, ln in enumerate(lineas):
        m = re.search(r'(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})', ln)
        if m:
            card['fecha'], card['hora'] = m.group(1), m.group(2)
            card['cancha'] = ln[:m.start()].strip()
            card['instancia'] = ln[m.end():].strip()
            cab = i
            break
    # Marcador: una linea 'A 38 B 18' o dos lineas 'A 61' / 'B 8'.
    j = cab + 1
    while j < len(lineas) and not lineas[j].strip():
        j += 1
    l1 = lineas[j].strip() if j < len(lineas) else ''
    l2 = lineas[j + 1].strip() if j + 1 < len(lineas) else ''
    m1 = re.fullmatch(r'(.+?)\s+(\d+)', l1)
    m2 = re.fullmatch(r'(.+?)\s+(\d+)', l2)
    mu = re.fullmatch(r'(.+?)\s+(\d+)\s+(.+?)\s+(\d+)', l1)
    if mu and not (m1 and m2):
        card['local'] = {'nombre': mu[1], 'score': int(mu[2])}
        card['visitante'] = {'nombre': mu[3], 'score': int(mu[4])}
    elif m1 and m2:
        card['local'] = {'nombre': m1[1], 'score': int(m1[2])}
        card['visitante'] = {'nombre': m2[1], 'score': int(m2[2])}
    m = re.search(r'Referee:\s*(.+)', texto)
    if m:
        a = re.split(r'\s{3,}', m.group(1).strip())[0].strip()
        if a:
            card['arbitro'] = limpiar_nombre(a)
    idx = [i for i, ln in enumerate(lineas) if re.match(r'^\s*Pos\s+Dor', ln)]
    card['plantel'] = [parse_jugadores(lineas[i + 1:]) for i in idx][:2]
    marcas = [i for i, ln in enumerate(lineas) if re.match(r'^\s*Incidencias equipo', ln)]
    inc = {'local': [], 'visitante': []}
    for k, i in enumerate(marcas):
        fin = marcas[k + 1] if k + 1 < len(marcas) else len(lineas)
        cuerpo = lineas[i + 1:fin]
        corte = len(cuerpo)
        for q, ln in enumerate(cuerpo):
            if re.match(r'^\s*(Tipos de amarilla|Observaciones\s*$|===== P)', ln):
                corte = q
                break
        cuerpo = cuerpo[:corte]
        cab = lineas[i]
        col = None
        for ln in cuerpo[:3]:
            pos = [m.start() for m in re.finditer(r'Tie\.', ln)]
            if len(pos) >= 2:
                col = pos[1]
                break
        if col is not None:
            izq, der = parse_lado_a_lado(cuerpo, col)
            inc['local'] += izq
            inc['visitante'] += der
        else:
            lado = 'local' if 'LOCAL' in cab.upper() else 'visitante'
            inc[lado] += parse_incidencias(cuerpo)
    card['inc'] = inc
    return card


def main():
    por_base = {}
    for c in sys.argv[1:]:
        for f in sorted(glob.glob(os.path.join(c, '*.txt'))):
            base = re.sub(r'_p\d{3}$', '', os.path.splitext(os.path.basename(f))[0])
            por_base.setdefault((c, base), []).append(f)
    tarjetas = []
    for (c, base), fs in sorted(por_base.items()):
        card = parse_tarjeta('\n'.join(leer(f) for f in sorted(fs)))
        card['archivo'] = f'{os.path.basename(c)}/{base}'
        tarjetas.append(card)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cards.raw.json'), 'w', encoding='utf8') as fh:
        json.dump(tarjetas, fh, ensure_ascii=False, indent=1)
    print(len(tarjetas), 'tarjetas')
    for t in tarjetas:
        p = t['plantel']
        print(t['numero'], t['fecha'], t['local']['nombre'], t['local']['score'], '-', t['visitante']['score'],
              t['visitante']['nombre'], '|', [len(x) for x in p], len(t['inc']['local']), len(t['inc']['visitante']),
              '|', t['archivo'])


if __name__ == '__main__':
    main()
