"""Fixture pendiente de las tarjetas UCR del 28/10: actualiza horarios de partidos existentes y crea los que faltan.
Uso: python fixture.py [--execute]"""
import sys, json, uuid, urllib.request, urllib.parse
sys.path.insert(0, '../cuyano-top8-2026')
from dbfetch import URL, KEY, get
EXEC = '--execute' in sys.argv
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
def send(m, path, body):
    r = urllib.request.Request(f'{URL}/rest/v1/{path}', data=json.dumps(body).encode(), method=m, headers=H)
    return urllib.request.urlopen(r).status
_ALL = {m['tournament_id'] for m in json.load(open('../trp-tarjetas/db_2026.json', encoding='utf8')) if m['tournament_id']}
def tid(prefix): return next(x for x in _ALL if x.startswith(prefix))
def fases(t): return {p['name']: p for p in get(f'tournament_phases?select=id,name,season_id&tournament_id=eq.{t}')}
def iso(f, h): d, m, y = f.split('/'); return f'{y}-{m}-{d}T{h}:00-03:00'
T = {k: tid(k) for k in ['62bf0694', 'b6ed4086', '55f28144', '1ad1a41f', 'f769a402', '8ead4164', '97cfa9ad', '923f73f7', '89ab3a8b']}
# (torneo, local, visitante, fecha, hora, fase(None=la del partido existente), etiqueta)
ITEMS = [
 ('1ad1a41f', 'club-la-tablada-m19-a', 'jockey-club-cordoba-m19-a', '31/10/2026', '18:30', None, 'Final'),
 ('55f28144', 'jockey-club-cordoba', 'san-martin-de-villa-maria', '31/10/2026', '14:00', None, 'Cuartos de Final'),
 ('55f28144', 'cordoba-athletic-club', 'club-universitario-de-cordoba', '31/10/2026', '18:00', None, 'Cuartos de Final'),
 ('b6ed4086', 'baguales-r-c', 'los-cuervos-r-c', '31/10/2026', '16:00', None, 'Semifinales'),
 ('b6ed4086', 'cordoba-rugby-club', 'alta-gracia-r-c', '31/10/2026', '16:00', None, 'Semifinales'),
 ('8ead4164', 'jockey-club-cordoba-preintermedia-a', 'la-tablada-a-pre-intermedia', '31/10/2026', '21:00', None, 'Final'),
 ('f769a402', 'tala-rugby-club-m19-b', 'club-palermo-bajo-m19-b', '31/10/2026', '16:15', None, 'Final ORO'),
 ('62bf0694', 'conas-r-c', 'cuises-portena-rugby', '01/11/2026', '15:00', 'Copa de Oro', 'Final Oro'),
 ('62bf0694', 'rosedal-r-c', 'universidad-siglo-21-rugby', '01/11/2026', '16:00', 'Copa de Oro', '3er Puesto (Oro)'),
 ('62bf0694', 'villa-libertador-r-c', 'ajedrez-cosquin-r-c', '01/11/2026', '16:00', 'Copa de Plata', 'Final'),
 ('b6ed4086', 'rio-tercero-r-c', 'aero-club-rio-iv', '31/10/2026', '16:00', 'SEMI', '7° puesto'),
 ('8ead4164', 'cordoba-athletic-club-preintermedia-a', 'uru-cure-rugby-club-preintermedia-a', '31/10/2026', '13:00', 'Posicionamiento 5to al 8vo', '5° puesto'),
 ('97cfa9ad', 'jockey-club-cordoba-preintermedia-b', 'cordoba-athletic-club-preintermedia-b', '31/10/2026', '16:00', 'Campeonato', 'Semifinales'),
 ('97cfa9ad', 'tala-rugby-club-preintermedia-b', 'la-tablada-b-pre-intermedia', '31/10/2026', '12:00', 'Campeonato', 'Semifinales'),
 ('923f73f7', 'tala-rugby-club-m17-a', 'club-universitario-de-cordoba-m17-a', '31/10/2026', '10:30', 'Cuartos de final', '3er Puesto'),
 ('923f73f7', 'uru-cure-rugby-club-m17-a', 'club-la-tablada-m17-a', '31/10/2026', '14:00', 'Cuartos de final', 'Final'),
 ('89ab3a8b', 'rio-tercero-r-c', 'combinado-capital', '31/10/2026', '15:00', 'Campeonato', 'Fecha 04'),
]
for pre, h, a, f, hora, fase, et in ITEMS:
    t = T[pre]; dt = iso(f, hora)
    ex = get(f'matches?select=id,date_time,status,home_club_id,away_club_id,phase_id,season_id&tournament_id=eq.{t}&date_time=gte.2026-10-24&status=eq.scheduled&or=(and(home_club_id.eq.{h},away_club_id.eq.{a}),and(home_club_id.eq.{a},away_club_id.eq.{h}))')
    if fase is None or fase == 'SEMI' and False:
        if len(ex) != 1: print('!! sin partido unico', pre, h, a, len(ex)); continue
        print('UPDATE', pre, h, 'vs', a, ex[0]['date_time'][:16], '->', dt, ex[0]['id'][:8])
        if EXEC: send('PATCH', f"matches?id=eq.{ex[0]['id']}", {'date_time': dt})
        continue
    if len(ex) == 1:
        print('UPDATE', pre, h, 'vs', a, ex[0]['date_time'][:16], '->', dt, ex[0]['id'][:8])
        if EXEC: send('PATCH', f"matches?id=eq.{ex[0]['id']}", {'date_time': dt, 'round_label': et})
        continue
    fs = fases(t)
    if fase == 'SEMI':
        # la fase de las semifinales ya cargadas en ese torneo
        sib = get(f'matches?select=phase_id,season_id&tournament_id=eq.{t}&home_club_id=eq.baguales-r-c&date_time=gte.2026-10-24&limit=1')[0]
        ph, se = sib['phase_id'], sib['season_id']
    else:
        ph, se = fs[fase]['id'], fs[fase]['season_id']
    row = {'id': str(uuid.uuid4()), 'tournament_id': t, 'season_id': se, 'phase_id': ph, 'home_club_id': h, 'away_club_id': a, 'date_time': dt,
           'status': 'scheduled', 'is_visible': True, 'review_status': 'approved', 'round_label': et}
    print('INSERT', pre, h, 'vs', a, dt, et, fase)
    if EXEC: send('POST', 'matches', [row])
