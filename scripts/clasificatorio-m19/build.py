"""Tarjetas del Clasificatorio M19 -> JSON de ficha-partido-local.ts. Uso: python build.py <salida.json>"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse import *
T_ID = '60b228c6-e85b-41fb-8f01-8357f49e2f3a'
FASE = {'IDA': 'Ida', 'VUELTA': 'Vuelta', 'SF ORO': 'Copa de Oro', 'SF PLATA': 'Copa de Plata'}
fases = {f['id']: f['name'] for f in rest(f'tournament_phases?tournament_id=eq.{T_ID}&select=id,name')}
db = rest(f'matches?tournament_id=eq.{T_ID}&select=id,phase_id,home_club_id,away_club_id,score&limit=1000')
out, problemas = [], []
for t in tarjetas():
    cl, cv = CLUBES[t['nl']], CLUBES[t['nv']]
    cand = [m for m in db if m['home_club_id'] == cl and m['away_club_id'] == cv and fases[m['phase_id']] == FASE[t['ronda']]]
    if len(cand) != 1: problemas.append(f"{t['num']}: {len(cand)} candidatos"); continue
    if not any(len(f) >= 6 for f in t['inc']['L'] + t['inc']['V']) and (t['pl'] or t['pv']):
        problemas.append(f"{t['num']} {t['nl']} {t['pl']}-{t['pv']} {t['nv']}: sin incidencias (W.O. o sin eventos), se omite"); continue
    ros, inc = t['ros'], t['inc']
    p = {'id': cand[0]['id'], 'rotulo': f"{cl} vs {cv} · Clasificatorio M19 · tarjeta {t['num']}", 'arbitro': arbitro(t['ref']),
         'local': {**lado(ros['L']), 'nombre': cl}, 'visitante': {**lado(ros['V']), 'nombre': cv}, 'eventos': []}
    av = []
    for side, club in (('local', cl), ('visitante', cv)):
        ok, nu, du = fijar_ids(p[side]['titulares'] + p[side]['suplentes'], club)
        av.append(f'{side}: fichas {ok} nuevas {nu}')
        for x in du: print('   DUDOSO', x)
    for k, side, ro in (('L', 'local', ros['L']), ('V', 'visitante', ros['V'])):
        ev, a = eventos(inc[k], ro)
        for e in ev: e['equipo'] = side
        p['eventos'] += ev; av += [f'{side}: {x}' for x in a]
    p['eventos'].sort(key=lambda e: (e['periodo'], e['minuto']))
    suma = {'local': 0, 'visitante': 0}
    for e in p['eventos']: suma[e['equipo']] += PUNTOS.get(e['tipo'], 0)
    print(t['ronda'], t['num'], f"{t['nl']} {t['pl']}-{t['pv']} {t['nv']}", 'eventos', suma['local'], suma['visitante'], *av)
    if (suma['local'], suma['visitante']) != (t['pl'], t['pv']):
        problemas.append(f"{t['num']} {cl}-{cv}: eventos {suma['local']}-{suma['visitante']} / tarjeta {t['pl']}-{t['pv']}")
        p['_difiere'] = True
        if not os.environ.get('CON_EVENTOS'): p['eventos'] = []
    out.append(p)
for x in problemas: print('PROBLEMA', x)
json.dump({'descripcion': 'Clasificatorio M19 Mar del Plata 2026 · tarjetas oficiales', 'partidos': out}, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'partidos')
