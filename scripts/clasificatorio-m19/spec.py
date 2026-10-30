"""Arma el spec de alta (torneo-liga-alta.ts) desde el txt. Salida: spec.json"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse import *
FASE = {'IDA': 'Ida', 'VUELTA': 'Vuelta', 'SF ORO': 'Copa de Oro', 'SF PLATA': 'Copa de Plata'}
CORTO = {'club-los-50': 'Los 50', 'ipr-sporting': 'Sporting', 'mar-del-plata-club': 'Mar del Plata', 'comercial-r-c': 'Comercial',
         'universitario-de-mar-del-plata': 'Universitario', 'union-del-sur': 'Unión del Sur', 'san-ignacio-r-c': 'San Ignacio',
         'los-cardos-r-c': 'Los Cardos', 'pueyrredon-mar-del-plata': 'Pueyrredón', 'bigua-rugby-club': 'Biguá', 'uncas-r-c': 'Uncas',
         'mar-del-plata-club-marron': 'Mar del Plata Marrón'}
partidos, wo = [], []
for t in tarjetas():
    f = FASE[t['ronda']]
    h, a = CLUBES[t['nl']], CLUBES[t['nv']]
    d, m, y = t['fecha'].split('/')
    jugados = bool(t['ros']['L'] or t['ros']['V'])
    p = dict(fase=f, fecha=f'{y}-{m}-{d}', hora=t['hora'], home=h, away=a, homeScore=t['pl'], awayScore=t['pv'], cerrado=True, tarjeta=t['num'], estado=t['estado'])
    if not jugados: wo.append(t['num'])
    partidos.append(p)
partidos.append(dict(fase='Copa de Bronce', fecha='2026-11-07', hora='12:00', home='pueyrredon-mar-del-plata', away='bigua-rugby-club', homeScore=None, awayScore=None, cerrado=False, tarjeta='327216', estado='Pendiente'))
ida = sorted({c for p in partidos if p['fase'] == 'Ida' for c in (p['home'], p['away'])})
vuelta = sorted({c for p in partidos if p['fase'] == 'Vuelta' for c in (p['home'], p['away'])})
oro = sorted({c for p in partidos if p['fase'] == 'Copa de Oro' for c in (p['home'], p['away'])})
plata = sorted({c for p in partidos if p['fase'] == 'Copa de Plata' for c in (p['home'], p['away'])})
spec = dict(nombre='Torneo Clasificatorio M19', slug='clasificatorio-m19-mar-del-plata-2026', origen='clasificatorio-m19-mdp-2026-tarjetas',
            fechaInicio='2026-03-14', unionId='union-de-rugby-de-mar-del-plata', gender='masculino', category='Juvenil', ageGrade='M19',
            fases=[dict(nombre='Ida', orden=1, clubes=ida), dict(nombre='Vuelta', orden=2, clubes=vuelta), dict(nombre='Copa de Oro', orden=3, clubes=oro),
                   dict(nombre='Copa de Plata', orden=4, clubes=plata), dict(nombre='Copa de Bronce', orden=5, clubes=['pueyrredon-mar-del-plata', 'bigua-rugby-club'])],
            clubes=[dict(id=k, corto=v) for k, v in CORTO.items()], partidos=partidos)
json.dump(spec, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spec.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(partidos), 'partidos; sin plantel (W.O.):', wo, '| ida', len(ida), 'vuelta', len(vuelta), 'oro', len(oro), 'plata', len(plata))
