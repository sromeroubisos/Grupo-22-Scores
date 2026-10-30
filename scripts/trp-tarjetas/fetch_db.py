"""Foto de la base: partidos desde 2026-03-01 y nombres de club. Salida en UTF-8."""
import json, os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'cuyano-top8-2026'))
from dbfetch import get


def todo(path):
    out, off = [], 0
    while True:
        r = get(path + f'&limit=1000&offset={off}')
        out += r
        if len(r) < 1000:
            return out
        off += 1000


ms = todo('matches?select=id,tournament_id,home_club_id,away_club_id,date_time,score,status,season_id,phase_id,referee,lineup_home_count,lineup_away_count,events_count&date_time=gte.2026-03-01&order=id')
cl = {c['id']: c['name'] for c in todo('clubs?select=id,name&order=id')}
json.dump(ms, open(os.path.join(AQUI, 'db_2026.json'), 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(cl, open(os.path.join(AQUI, 'clubs.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(ms), 'partidos', len(cl), 'clubes')
