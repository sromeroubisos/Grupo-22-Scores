"""Tarjeta SIGER (texto pegado) del Encuentro Femenino de Selecciones de XV -> JSON de ficha-partido-local.ts.
Uso: python build_tarjeta.py <tarjeta.txt> <salida.json> <match_id> [local_id visitante_id rotulo]"""
import json, re, sys
txt = open(sys.argv[1], encoding='utf8').read().replace('\r', '')
ls = txt.split('\n')
def nom(s):
    a, _, b = s.partition(',')
    return (b.strip() + ' ' + a.strip()).strip() if b else a.strip()
def idx(p, d=0): return next(i for i in range(d, len(ls)) if ls[i].startswith(p))
iil, iiv, iel, iev, ifin = idx('Incidencias LOCAL'), idx('Incidencias VISITANTE'), idx('Entrenador LOCAL'), idx('Entrenador VISITANTE'), idx('Incidencias PARTIDO')
def plantel(a, b):
    out = []
    for l in ls[a:b]:
        p = l.split('\t')
        if len(p) >= 3 and p[0].isdigit() and p[1].isdigit(): out.append((int(p[0]), nom(p[2].strip())))
    return out
def lado(pl): return {'titulares': [{'numero': n, 'nombre': x} for n, x in pl if n <= 15], 'suplentes': [{'numero': n, 'nombre': x} for n, x in pl if n > 15]}
TIPOS = {'try': 'try', 'conversión': 'conversion', 'conversion': 'conversion', 'penal': 'penalty_goal', 'drop': 'drop_goal', 'amarilla': 'card_yellow', 'roja': 'card_red'}
ev = []
for eq, (a, b) in (('local', (iil, iiv)), ('visitante', (iiv, iel))):
    sale = None
    for l in ls[a + 2:b]:
        p = l.split('\t') + [''] * 8
        if p[0] not in ('1T', '2T'): continue
        per, mi, sim, texto, pun, jug = p[0], int(p[1]), p[2], p[3].strip(), p[4], re.sub(r'^\d+ - ', '', p[5].strip())
        jug = nom(jug)
        if texto == 'Se retiró': sale = jug; continue
        if texto == 'Ingresó':
            ev.append({'minuto': mi, 'periodo': per, 'tipo': 'substitution', 'equipo': eq, 'jugador': sale, 'detalle': 'Entra: ' + jug}); sale = None; continue
        t = TIPOS.get(texto.lower()); assert t, texto
        ev.append({'minuto': mi, 'periodo': per, 'tipo': t, 'equipo': eq, 'jugador': jug, 'detalle': p[6].strip() if t.startswith('card') else ''})
ref = nom(re.search(r'Referee : (.+)', txt)[1].strip())
tot = {'local': 0, 'visitante': 0}
for e in ev: tot[e['equipo']] += {'try': 5, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}.get(e['tipo'], 0)
print('marcador por eventos', tot)
json.dump({'descripcion': 'Encuentro Femenino de Selecciones de XV 2026 · tarjeta oficial', 'partidos': [{'id': sys.argv[3], 'rotulo': (sys.argv[6] if len(sys.argv) > 6 else 'Alto Valle vs Buenos Aires · Zona A · tarjeta 327932'), 'arbitro': ref, 'local': {'nombre': (sys.argv[4] if len(sys.argv) > 4 else 'alto-valle-femenino'), **lado(plantel(iel, iev))}, 'visitante': {'nombre': (sys.argv[5] if len(sys.argv) > 5 else 'buenos-aires-femenino'), **lado(plantel(iev, ifin))}, 'eventos': ev}]}, open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
