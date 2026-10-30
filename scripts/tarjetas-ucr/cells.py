import fitz, numpy as np, json, sys, re, os, glob, unicodedata, difflib
from PIL import Image
D = os.environ.get('TARJETAS_DIR', 'tarjetas/').rstrip('/') + '/'
OUT = 'cellsout/'
DPI = 200
_ocr = None

def ocr():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    return _ocr

def cluster(idx, gap=2):
    if len(idx) == 0: return []
    out = []; s = p = idx[0]
    for v in idx[1:]:
        if v - p > gap:
            out.append((s + p) // 2); s = v
        p = v
    out.append((s + p) // 2)
    return out

CONF = {'。': '9', '：': '8', ':': '8', '→': '1', '|': '1', 'I': '1', 'l': '1', 'O': '0', 'o': '0'}
INC = ['try', 'try penal', 'conversion', 'penal', 'drop', 'amarilla', 'roja', 'se retiro', 'ingreso', 'lesionado', 'conmocion cerebral', 'tarjeta azul']

def fold(t):
    t = unicodedata.normalize('NFKC', t)
    return ''.join(c for c in unicodedata.normalize('NFKD', t) if not unicodedata.combining(c))

def num(t):
    t = fold(t).strip()
    t = ''.join(CONF.get(c, c) for c in t).replace(' ', '')
    return int(t) if re.fullmatch(r'\d{1,3}', t) else None

def canon_inc(t):
    f = re.sub(r'\s+', ' ', fold(t).lower()).strip()
    if not f: return ''
    m = difflib.get_close_matches(f, INC, n=1, cutoff=0.55)
    return m[0] if m else 'otro:' + f

def tiempo(t):
    f = fold(t).upper().replace(' ', '')
    if f in ('1T', 'IT', 'LT', '|T', '1'): return '1T'
    if f in ('2T', 'ZT', '2'): return '2T'
    if f == 'ET': return 'ET'
    return None

def prep(cell, padx=10):
    return np.pad(np.array(Image.fromarray(cell).convert('RGB')), ((8, 8), (padx, padx), (0, 0)), constant_values=255)

def rec_batch(arrs):
    if not arrs: return []
    res, _ = ocr().text_recognizer(arrs)
    return [t.strip() for t, sc in res]

def retry_num(cell):
    for sc in (1.6, 2.4, 3.2, 1.2):
        h, w = cell.shape[:2]
        pil = Image.fromarray(cell).convert('RGB').resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.LANCZOS)
        arr = np.pad(np.array(pil), ((10, 10), (30, 30), (0, 0)), constant_values=255)
        n = num(rec_batch([arr])[0])
        if n is not None: return n
    return None

def retry_tie(cell):
    for sc in (1.6, 2.4, 3.2, 1.2, 4.0):
        h, w = cell.shape[:2]
        pil = Image.fromarray(cell).convert('RGB').resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.LANCZOS)
        arr = np.pad(np.array(pil), ((10, 10), (30, 30), (0, 0)), constant_values=255)
        t = fold(rec_batch([arr])[0]).upper().replace(' ', '')
        if re.fullmatch(r'[12]T', t): return t
    return None

def half_tables(gray):
    frac = (gray < 238).mean(axis=1)
    lines = cluster(np.where(frac > 0.7)[0])
    blocks = []; cur = [lines[0]] if lines else []
    for a, b in zip(lines, lines[1:]):
        if 26 <= b - a <= 38: cur.append(b)
        else:
            if len(cur) >= 3: blocks.append(cur)
            cur = [b]
    if len(cur) >= 3: blocks.append(cur)
    tables = []
    for blk in blocks:
        seg = gray[blk[1]:blk[-1], :]
        vl = cluster(np.where((seg < 238).mean(axis=0) > 0.8)[0])
        if len(vl) == 6: vl.append(min(gray.shape[1] - 1, vl[-1] + 280))
        if len(vl) != 7: continue
        cells = []
        for ri, (r0, r1) in enumerate(zip(blk, blk[1:])):
            for ci in range(6):
                c = gray[r0 + 3:r1 - 2, vl[ci] + 3:vl[ci + 1] - 2]
                cells.append(None if c.size == 0 or (c < 150).mean() < 0.006 else c)
        tcell = gray[blk[0] + 3:blk[1] - 2, vl[0] + 3:vl[-1] - 2]
        arrs = [prep(c, 14) for c in cells if c is not None]
        arrs.append(prep(tcell, 14))
        txt = rec_batch(arrs)
        title = txt[-1]; txt = txt[:-1]
        it = iter(txt)
        raw = [next(it) if c is not None else '' for c in cells]
        rows = []
        for ri in range(len(blk) - 1):
            rows.append({'raw': raw[ri * 6:(ri + 1) * 6], 'crops': cells[ri * 6:(ri + 1) * 6]})
        tables.append({'title': title, 'rows': rows})
    return tables

def clean(tb):
    t = fold(tb['title']).lower()
    lado = 'visit' if 'visit' in t or 'vis' in t else ('local' if 'loc' in t or 'cal' in t else None)
    out = []; prev_t = '1T'; flags = []
    for k, r in enumerate(tb['rows']):
        raw = r['raw']
        if k == 0 or fold(raw[0]).lower().startswith('tie') or not any(raw): continue
        if not raw[2]:
            continue
        raw0 = fold(raw[0]).strip().upper().replace(' ', '')
        tt = raw0 if raw0 in ('1T', '2T') else None
        if tt is None and r['crops'][0] is not None:
            tt = retry_tie(r['crops'][0])
        if tt is None:
            mm = num(raw[1]) if raw[1] else None
            tt = '2T' if (mm is not None and mm % 100 > 41) else prev_t
            flags.append(('tie?', raw))
        prev_t = tt
        inc = canon_inc(raw[2])
        vals = []
        for ci in (1, 3, 4):
            txt = raw[ci]
            if not txt and r['crops'][ci] is None:
                vals.append(None); continue
            n = num(txt)
            if n is None and r['crops'][ci] is not None:
                n = retry_num(r['crops'][ci])
                if n is None: flags.append(('num?', ci, txt, raw))
            if n is not None and ci == 1 and n > 99: n = n % 100; flags.append(('min3', txt, raw))
            vals.append(n)
        out.append({'tiempo': tt, 'min': vals[0], 'inc': inc, 'ptos': vals[1], 'dor': vals[2], 'obs': raw[5], 'raw': raw})
    return {'lado': lado, 'title': tb['title'], 'rows': out, 'flags': flags}

def card(name):
    d = fitz.open(D + name + '.pdf')
    res = {'file': name, 'tablas': []}
    for pi, (f0, f1) in ((0, (0.595, 1.0)), (1, (0.0, 0.5))):
        pm = d[pi].get_pixmap(dpi=DPI)
        img = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.h, pm.w, pm.n)[:, :, :3]
        g = img.mean(axis=2).astype(np.uint8)
        H, W = g.shape
        reg = g[int(H * f0):int(H * f1)]
        for half, sl in (('left', slice(0, W // 2)), ('right', slice(W // 2, W))):
            for tb in half_tables(reg[:, sl]):
                c = clean(tb)
                c['page'] = pi + 1; c['half'] = half
                if c['lado'] is None and pi == 0: c['lado'] = 'local' if half == 'left' else 'visit'
                res['tablas'].append(c)
    return res

def work(f):
    n = os.path.basename(f)[:-4]
    err = ''
    for intento in range(3):
        try:
            r = card(n)
            json.dump(r, open(OUT + n + '.json', 'w', encoding='utf-8'), ensure_ascii=False)
            return n
        except Exception as e:
            err = repr(e)[:90]
    return n + ' FALLO ' + err

if __name__ == '__main__':
    from multiprocessing import Pool
    os.makedirs(OUT, exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] != '--all':
        r = card(sys.argv[1])
        for t in r['tablas']:
            print('==', t['page'], t['half'], t['lado'], t['title'], 'flags', len(t['flags']))
            for row in t['rows']:
                print('  ', row['tiempo'], row['min'], row['inc'], row['ptos'], row['dor'], row['obs'][:40])
            for fl in t['flags']: print('   FLAG', fl)
    else:
        fs = sorted(glob.glob(D + '*.pdf'))
        fs = [f for f in fs if not os.path.exists(OUT + os.path.basename(f)[:-4] + '.json')]
        with Pool(3) as p:
            for n in p.imap_unordered(work, fs): print('ok', n.encode('ascii', 'replace').decode(), flush=True)
