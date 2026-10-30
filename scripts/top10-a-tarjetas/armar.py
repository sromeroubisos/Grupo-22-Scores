"""Arma top10a.json (formato ficha-partido-local) con jugadores resueltos por ficha y eventos por dorsal."""
import json, re
exec(open('resolver.py', encoding='utf-8').read().split("res = collections.Counter()")[0])
TIPOS = [('try penal', 'penalty_try'), ('try', 'try'), ('conv', 'conversion'), ('penal', 'penalty_goal'), ('drop', 'drop_goal'),
         ('amar', 'card_yellow'), ('roja', 'card_red'), ('se ret', 'out'), ('ingres', 'in'), ('lesion', 'injury'), ('conmo', 'concussion'), ('tarjeta az', 'blue')]
def tipo(txt):
    t = txt.lower()
    for k, v in TIPOS:
        if t.startswith(k): return v
    raise ValueError(txt)
def score(i, o, ros):
    pi, po = ros.get(i, ['99']), ros.get(o, ['99'])
    if pi[0] == po[0]: return 3
    if pi[0] in po[1:]: return 2
    return 1 if set(pi) & set(po) else 0
RENOMBRAR = {  # ficha -> nombre correcto (la tarjeta trae el texto limpio; el OCR viejo dejó basura)
    'Salvador Mat Cabanillas Martinez': 'Salvador Mateo Cabanillas Martinez',
    'Nicolás AgusBih Fernández ladonisi': 'Nicolás Agustín Fernández Iadonisi',
}
def eventos(incs, rosr, nombre_de):
    pos = {r['n']: [p for p in [] ] or ['99'] for r in rosr}
    out, pend_o, pend_i, avisos, grupos = [], [], [], [], []
    for f in incs:
        per = '1T' if f[0] == '1T' else '2T'
        grupos.append((per, int(f[1]) if f[0] != 'ET' else 40, f))
    def num(f):
        m = re.match(r'^\s*(\d+)\s*-', f[5]) if len(f) > 5 else None
        return int(m.group(1)) if m else None
    for per, mi, f in grupos:
        t = tipo(f[3]); n = num(f); j = nombre_de(n) if n else ''
        d = f[6].strip() if len(f) > 6 else ''
        if t == 'out': pend_o.append((len(out), per, mi, n)); out.append(None); continue
        if t == 'in': pend_i.append((len(out), per, mi, n)); out.append(None); continue
        if t == 'blue': t, d = 'injury', 'Tarjeta azul' + (' · ' + d if d else '')
        if t == 'concussion': t, d = 'injury', 'Conmoción cerebral' + (' · ' + d if d else '')
        elif t == 'injury': d = d or 'Lesionado'
        if t == 'injury' and f[3].lower().startswith('lesion'): pend_o.append((-1, per, mi, n))
        elif t == 'card_yellow': d = ''
        e = {'minuto': mi, 'periodo': per, 'tipo': t, 'jugador': j}
        if d: e['detalle'] = d
        out.append(e)
    # posiciones por dorsal (Pos. columna del roster) para emparejar salida con ingreso
    while pend_o and pend_i:
        best = max(((score(i[3], o[3], POS), -abs(i[2] - o[2]), -(abs(i[0] - o[0])), oi, ii) for oi, o in enumerate(pend_o) for ii, i in enumerate(pend_i)), key=lambda x: x[:3])
        _, _, _, oi, ii = best
        o, i = pend_o.pop(oi), pend_i.pop(ii)
        idx, per, mi = max(o, i, key=lambda z: z[0])[0], i[1], max(o[2], i[2])
        out[idx] = {'minuto': mi, 'periodo': per, 'tipo': 'substitution', 'jugador': nombre_de(o[3]), 'detalle': f'Entra: {nombre_de(i[3])}'}
    for x in pend_o + pend_i: avisos.append(f'sin pareja: {x}')
    return [e for e in out if e], avisos
raw = open('fuente.txt', encoding='utf-8-sig').read().replace('\r', '')
# posiciones (columna Pos. del roster) por tarjeta/lado/dorsal
def pos_de(c, k):
    return {r['n']: r.get('pos') or ['99'] for r in c['ros'][k]}
partidos = []; avisos_all = []
for c, m in pares:
    P = {'id': m['id'], 'rotulo': f"{c['equipos'][0]['club'].title()} vs {c['equipos'][1]['club'].title()} · Top 10 A {c['fecha']} · tarjeta {c['num']}", 'arbitro': c['ref'], 'eventos': []}
    club_by_side = {'L': m['home_club_id'], 'V': m['away_club_id']}
    for side, k, lado in (('home', 'L', 'local'), ('away', 'V', 'visitante')):
        hint = {e.get('number'): e['id'] for e in m['lineups'][side]}
        nombres, tit, sup = {}, [], []
        for r in c['ros'][k]:
            fid, como = resolver(club_by_side[k], r, hint.get(r['n']))
            nom = people[fid]['full_name'] if fid else nat(r['nombre'])
            nom = RENOMBRAR.get(nom, nom)
            nombres[r['n']] = nom
            (tit if r['n'] <= 15 else sup).append({'numero': r['n'], 'nombre': nom, 'id': fid})
        P[lado] = {'nombre': c['equipos'][0 if k == 'L' else 1]['club'], 'titulares': tit, 'suplentes': sup}
        global POS
        POS = pos_de(c, k)
        ev, av = eventos(c['inc'][k], c['ros'][k], lambda n: nombres.get(n, ''))
        for e in ev: e['equipo'] = lado
        P['eventos'] += ev
        avisos_all += [(c['num'], lado, a) for a in av]
    P['eventos'].sort(key=lambda e: (e['periodo'], e['minuto']))
    partidos.append(P)
json.dump({'descripcion': 'Top 10 A 2026 · 90 tarjetas UCR limpias', 'partidos': partidos}, open('top10a.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(partidos), 'partidos;', sum(len(p['eventos']) for p in partidos), 'eventos; avisos:', len(avisos_all)); print(avisos_all[:15])
