"""Parsea el txt de tarjetas UCR del Top 10 A 2026 a cards.json (con DNI). Solo lectura."""
import re, json, sys
raw = open('fuente.txt', encoding='utf-8-sig').read().replace('\r', '')
cards, seen = [], set()
_idx = [m.start() for m in re.finditer(r'(?m)^Partido n.mero : \d+', raw)]
_chunks = []
for _i, _s in enumerate(_idx):
    _e = _idx[_i + 1] if _i + 1 < len(_idx) else len(raw)
    _f = re.findall(r'Fecha : [^\n]*', raw[max(0, _s - 160):_s])
    _chunks.append((_f[-1] + '\n' if _f else '') + raw[_s:_e])
for c in _chunks:
    L = c.split('\n')
    m = next((re.search(r'(\d+)', l).group(1) for l in L if l.startswith('Partido n')), None)
    if not m or m in seen: continue
    seen.add(m)
    fecha = next((l.split(':', 1)[1].strip() for l in L if l.startswith('Fecha :')), '')
    fj = next((l.split(':', 1)[1].strip() for l in L if l.startswith('Fecha de juego')), '')
    # marcador y equipos: tras "Cerrado"/"Iniciado": "55 [5]" / EQUIPO / ... / "-" / "36 [1]" / EQUIPO
    team = []
    fin = next((i for i, l in enumerate(L) if l.startswith('Cerrar partido')), len(L))
    for i, l in enumerate(L[:fin]):
        mm = re.match(r'^\s*(\d+)(?:\s*\[(\d+)\])?\s*$', l)
        if mm and len(team) < 2:
            nm = next((x.strip() for x in L[i+1:i+4] if x.strip() and not x.strip().startswith('CONFIRM')), '')
            team.append({'pts': int(mm.group(1)), 'bonus': int(mm.group(2) or 0), 'club': nm})
    sec, inc, ros = None, {'L': [], 'V': []}, {'L': [], 'V': []}
    for l in L:
        if l.startswith('Incidencias LOCAL'): sec = ('i', 'L'); continue
        if l.startswith('Incidencias VISITANTE'): sec = ('i', 'V'); continue
        if l.startswith('Miembros del equipo LOCAL'): sec = ('r', 'L'); continue
        if l.startswith('Miembros del equipo VISITANTE'): sec = ('r', 'V'); continue
        if l.startswith('Incidencias PARTIDO'): sec = None
        if not sec: continue
        f = l.split('\t')
        if sec[0] == 'i' and len(f) >= 6 and re.match(r'^(1T|2T|ET)$', f[0]): inc[sec[1]].append(f)
        if sec[0] == 'r' and len(f) >= 9 and f[0].isdigit() and f[1].isdigit(): ros[sec[1]].append({'n': int(f[0]), 'dni': f[1], 'nombre': f[2], 'pos': [p for p in f[5:8] if p.isdigit()]})
    ref = next((l.split(':', 1)[1].strip() for l in L if l.startswith('Referee')), '')
    cards.append({'num': m, 'fecha': fecha, 'juego': fj, 'ref': ref, 'equipos': team, 'inc': inc, 'ros': ros})
json.dump(cards, open('cards.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(cards), 'tarjetas')
import collections
print(collections.Counter(c['fecha'] for c in cards))
for c in cards[:3] + cards[-3:]: print(c['num'], c['juego'], [(t['club'], t['pts']) for t in c['equipos']], len(c['ros']['L']), len(c['ros']['V']), len(c['inc']['L']), len(c['inc']['V']))
print('sin 23:', [c['num'] for c in cards if len(c['ros']['L']) != 23 or len(c['ros']['V']) != 23])
print('sin equipos:', [c['num'] for c in cards if len(c['equipos']) != 2])
