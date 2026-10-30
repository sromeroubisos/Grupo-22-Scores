"""Lee las 12 fichas de partido de rugbydecuyo.com.ar (01-mendoza-liceo.html ...) a JSON.
Columnas del cronograma: izquierda = local, centro = marcador, derecha = visitante."""
import re, html, json, glob, os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, 'fuente')

def leer(path):
    raw = open(path, 'rb').read()
    try: return raw.decode('utf-8')
    except UnicodeDecodeError: return raw.decode('latin-1')

def limpio(s):
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s).replace('\xa0', ' ')
    return s

def celdas(tr):
    return [c for c in re.findall(r'<t[dh][^>]*>(.*?)(?=</t[dh]>)', tr, flags=re.S | re.I)]

def lineas(c):
    return [re.sub(r'\s+', ' ', l).strip() for l in limpio(c).split('\n') if l.strip()]

def parse(path):
    t = leer(path)
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', t, flags=re.S | re.I)
    out = {'local': {'titulares': [], 'ingresaron': [], 'amonestados': [], 'expulsados': []},
           'visitante': {'titulares': [], 'ingresaron': [], 'amonestados': [], 'expulsados': []}, 'eventos': []}
    # titulo y fecha
    m = re.search(r'(Mendoza|San Juan)\s*-\s*([^<\n]*?de 2026)', limpio(t))
    out['fecha_texto'] = m.group(2).strip() if m else None
    ref = re.search(r'REFEREE</strong>\s*:\s*([^<\n]+)', t, flags=re.I)
    out['arbitro'] = html.unescape(ref.group(1)).strip() if ref else None
    can = re.search(r'CANCHA</strong>\s*:\s*([^<\n]+)', t, flags=re.I)
    out['cancha'] = html.unescape(can.group(1)).strip() if can else None
    # etiquetas de equipo: primer par "XXX RC"
    equipos = re.findall(r'<span[^>]*>\s*([A-ZÁÉÍÓÚÜÑ\. ]+?(?:RC|R\.C\.|TEQÜE|TEQ&Uuml;E))\s*</span>', t)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', t, flags=re.S | re.I)
    estado = 'ini'
    periodo = '1T'
    for tr in rows:
        cs = celdas(tr)
        txt = [lineas(c) for c in cs]
        plano = ' '.join(' '.join(x) for x in txt)
        # titulares: dos celdas "N. NOMBRE"
        if len(cs) == 2:
            a, b = txt
            ja = ' '.join(a); jb = ' '.join(b)
            ma = re.match(r'^(\d{1,2})\s*\.\s*(.+)$', ja); mb = re.match(r'^(\d{1,2})\s*\.\s*(.+)$', jb)
            if ma and mb and int(ma.group(1)) <= 15 and int(mb.group(1)) <= 15:
                out['local']['titulares'].append((int(ma.group(1)), ma.group(2).strip()))
                out['visitante']['titulares'].append((int(mb.group(1)), mb.group(2).strip()))
                continue
            for clave, lado in (('INGRESARON', 'ingresaron'), ('AMONESTADOS', 'amonestados'), ('EXPULSADOS', 'expulsados')):
                if a and a[0].upper().startswith(clave) or b and b[0].upper().startswith(clave):
                    out['local'][lado] = [x for x in a if not x.upper().startswith(clave) and x != '|']
                    out['visitante'][lado] = [x for x in b if not x.upper().startswith(clave) and x != '|']
        if len(cs) == 3:
            izq, mid, der = cs
            if re.search(r'ENTRETIEMPO', limpio(izq + mid + der), flags=re.I):
                periodo = '2T'; continue
            for lado, c in (('local', izq), ('visitante', der)):
                for l in lineas(c):
                    for ev in re.finditer(r"(\d+)'\s*(TRY PENAL|TRY|PENAL|DROP)\b\s*([^()]*?)\s*(?:\(([^)]*)\))?\s*$", l):
                        out['eventos'].append({'minuto': int(ev.group(1)), 'periodo': periodo, 'tipo': ev.group(2),
                                               'equipo': lado, 'jugador': ev.group(3).strip(), 'conv': (ev.group(4) or '').strip()})
        # fila de titulo con el entretiempo en una celda
        elif re.search(r'ENTRETIEMPO', plano, flags=re.I) and len(cs) <= 2:
            periodo = '2T'
    return out

if __name__ == '__main__':
    res = {}
    for f in sorted(glob.glob(os.path.join(FUENTE, '[01][0-9]-*.html'))):
        res[os.path.basename(f)] = parse(f)
    json.dump(res, open(os.path.join(AQUI, 'fichas.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    for k, v in res.items():
        print(k, len(v['local']['titulares']), len(v['visitante']['titulares']), len(v['eventos']), v['arbitro'], '|', v['cancha'])
