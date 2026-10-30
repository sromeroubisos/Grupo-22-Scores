import json, re, glob, os, sys, unicodedata

def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))

def norm(s):
    return re.sub(r'\s+', ' ', fold(s).lower()).strip()

DOC = re.compile(r'^\d{6,9}$')
INT = re.compile(r'^\d{1,2}$')

def split_name_doc(tok):
    m = re.match(r'^(.*?[A-Za-z\.])\s*(\d{6,9})$', tok)
    if m:
        return m.group(1).strip(), m.group(2)
    return tok, None

def clean_name(n):
    n = re.sub(r'\s*,\s*', ', ', n.strip())
    return re.sub(r'\s+', ' ', n)

def parse_roster(rows):
    players = []
    stop = None
    for i, r in enumerate(rows):
        j = norm(' '.join(r))
        if j.startswith('referee') or j.startswith('director del partido'):
            stop = i
            break
        toks = [t.strip() for t in r if t.strip()]
        if not toks:
            continue
        if any(norm(t) in ('pos', 'dor', 'apellido y nombre') for t in toks):
            continue
        doc = None
        name = None
        ints = []
        for t in toks:
            if DOC.match(t):
                doc = t
            elif INT.match(t):
                ints.append(int(t))
            elif re.search(r'[A-Za-z]', t) and name is None:
                n, d = split_name_doc(t)
                name = clean_name(n)
                if d:
                    doc = d
        if not name:
            continue
        # marcas X (OCR las lee como 'X' suelto)
        marks = [t for t in toks if t.upper() in ('X', 'x')]
        players.append({'ints': ints, 'name': name, 'doc': doc, 'marks': len(marks)})
    # numerar: pos = orden de aparicion
    out = []
    for idx, p in enumerate(players):
        pos = idx + 1
        ints = p['ints']
        # ints: [pos, dor] normalmente; si faltan, caer a pos
        dor = pos
        if len(ints) >= 2:
            dor = ints[1]
        elif len(ints) == 1:
            dor = ints[0]
        out.append({'pos': pos, 'dor': dor, 'name': p['name'], 'doc': p['doc'], 'warn': len(ints) < 2})
    return out, rows[stop:] if stop is not None else []

LABELS_L = ['referee', 'referee aux.1', 'medico oficial', 'capitan local', 'encargado local', 'medico local', 'entrenador']
LABELS_R = ['director del partido', 'referee aux.2', 'matricula del medico', 'capitan visitante', 'encargado visitante', 'medico visitante', 'entrenador']

def parse_officials(rows):
    res = {}
    for r in rows:
        toks = [t for t in r if t.strip()]
        j = ' | '.join(toks)
        if 'ncidencias' in norm(j):
            break
        m = re.match(r'^([^:]+):\s*(.*)$', toks[0]) if toks else None
        if not m:
            continue
        label = norm(m.group(1))
        val = m.group(2).strip()
        if not val and len(toks) > 1:
            val = ' '.join(toks[1:]).strip()
        res[label] = val
    return res

def split_coach(v):
    if not v:
        return None, None
    m = re.match(r'^(.*?[A-Za-z\.])\s*(\d{6,9})$', v)
    if m:
        return m.group(1).strip(), m.group(2)
    return v, None

def parse_incidents(rows):
    started = False
    ev = []
    for r in rows:
        toks = [t.strip() for t in r if t.strip()]
        if not toks:
            continue
        if not started:
            if 'ncidencias' in norm(' '.join(toks)):
                started = True
            continue
        if norm(toks[0]) in ('tie.', 'tie'):
            continue
        if norm(toks[0]).startswith('tipos de') or norm(toks[0]).startswith('s.c.'):
            break
        if not re.match(r'^(1T|2T|ET|1t|2t)$', toks[0]):
            ev.append({'raw': toks, 'bad': True})
            continue
        e = {'tiempo': toks[0].upper(), 'raw': toks}
        rest = toks[1:]
        # minuto
        if rest and re.match(r'^\d{1,3}$', rest[0]):
            e['min'] = int(rest[0]); rest = rest[1:]
        # incidencia
        if rest:
            e['inc'] = rest[0]; rest = rest[1:]
        nums = []
        obs = []
        for t in rest:
            if re.match(r'^\d{1,2}$', t):
                nums.append(int(t))
            else:
                obs.append(t)
        e['nums'] = nums
        e['obs'] = ' '.join(obs)
        ev.append(e)
    return ev

def parse_card(path):
    d = json.load(open(path, encoding='utf-8'))
    c = {'file': d['file']}
    top = d['top']
    for r in top:
        j = ' '.join(r)
        m = re.search(r'Tarjeta de partido.*?(\d{3,})', j)
        if m:
            c['tarjeta'] = m.group(1)
    # header values
    hdr = None
    for i, r in enumerate(top):
        if any(norm(t) == 'cancha' for t in r):
            hdr = top[i + 1] if i + 1 < len(top) else None
            break
    if hdr:
        c['hdr'] = hdr
        jj = ' | '.join(hdr)
        m = re.search(r'(\d{4}-\d{2}-\d{2})', jj)
        if m: c['fecha_iso'] = m.group(1)
        m = re.search(r'\b(\d{1,2}:\d{2})\b', jj)
        if m: c['hora'] = m.group(1)
        c['cancha'] = hdr[0]
        c['torneo'] = next((t for t in hdr if 'TOP' in t.upper() or 'REGION' in t.upper()), None)
        c['instancia'] = next((t for t in hdr if t.isupper() and 'REGION' not in t and t.upper() not in ('PRIMERA',)), None)
        m = re.search(r'(Fecha\s*\d+|[A-Za-z ]*Fecha[^|]*)\s*$', jj)
        c['ronda'] = hdr[-1]
    # score row: [nombre local ..., int, nombre visitante ..., int]
    for r in top:
        jj = ' '.join(r)
        if 'Tarjeta' in jj or 'Cancha' in jj or re.search(r'\d{4}-\d{2}-\d{2}', jj):
            continue
        pos = [i for i, t in enumerate(r) if re.match(r'^\d{1,3}$', t)]
        if len(pos) == 2 and pos[0] > 0 and pos[1] > pos[0] + 1:
            c['home'] = ' '.join(r[:pos[0]]); c['away'] = ' '.join(r[pos[0] + 1:pos[1]])
            c['score'] = [int(r[pos[0]]), int(r[pos[1]])]
    c['top'] = top
    left, offl = parse_roster(d['left'])
    right, offr = parse_roster(d['right'])
    c['local'] = left
    c['visit'] = right
    ol = parse_officials(offl); orr = parse_officials(offr)
    c['arbitro'] = ol.get('referee')
    c['aux1'] = ol.get('referee aux.1')
    c['aux2'] = orr.get('referee aux.2')
    c['director'] = orr.get('director del partido')
    c['cap_local'] = ol.get('capitan local'); c['cap_visit'] = orr.get('capitan visitante')
    c['dt_local'] = split_coach(ol.get('entrenador')); c['dt_visit'] = split_coach(orr.get('entrenador'))
    c['off_l'] = ol; c['off_r'] = orr
    c['inc_local'] = parse_incidents(offl)
    c['inc_visit'] = parse_incidents(offr)
    c['extra_pages'] = d.get('pages')
    return c

if __name__ == '__main__':
    for p in sys.argv[1:]:
        c = parse_card(p)
        print(json.dumps({k: v for k, v in c.items() if k not in ('top', 'extra_pages')}, ensure_ascii=False, indent=1))
