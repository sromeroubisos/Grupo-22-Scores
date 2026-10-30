import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cuyano-top8-2026'))
from dbfetch import get as rest
IDS = {'trpc': '0c774fd6-7153-403d-9d33-b1a4f8516a63', 'clausura': 'e77a678a-776c-412e-a012-2fd17bde630e',
       'austral': '4e0fb15f-89a2-425f-8830-43eeef981860', 'norpat': '46313785-4686-4e69-b1de-d664527c143c'}
for k, slug in (('apertura', 'urtdf-zona-competencia-apertura'), ('cordillerano', 'torneo-cordillerano'), ('mayores', 'oficial-mayores-alto-valle'), ('primerab', 'primera-b-alto-valle')):
    IDS[k] = rest(f'tournaments?select=id&slug=eq.{slug}')[0]['id']
out = {}
for k, tid in IDS.items():
    out[k] = rest(f'matches?tournament_id=eq.{tid}&date_time=gte.2026-01-01&select=id,date_time,home_club_id,away_club_id,score,status,referee,lineup_home_count,lineup_away_count,events_count,season_id,phase_id&order=date_time,id&limit=1000')
    print(k, tid, len(out[k]))
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db_estado.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
