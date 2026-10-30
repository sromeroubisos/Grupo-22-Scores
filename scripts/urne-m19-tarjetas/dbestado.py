"""Baja los partidos de los dos torneos M19 URNE a db_estado.json ({apertura: [...], oficial: [...]})."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cuyano-top8-2026'))
from dbfetch import get
AQUI = os.path.dirname(os.path.abspath(__file__))
out = {}
for k, slug in (('apertura', 'urne-apertura-2026-m19'), ('oficial', 'urne-oficial-2026-m19')):
    tid = get(f'tournaments?slug=eq.{slug}&select=id')[0]['id']
    out[k] = get(f'matches?tournament_id=eq.{tid}&select=id,date_time,home_club_id,away_club_id,score,status&limit=200')
    print(k, len(out[k]))
json.dump(out, open(os.path.join(AQUI, 'db_estado.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
