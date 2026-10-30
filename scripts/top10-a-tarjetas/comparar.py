import json, re, unicodedata, collections, os, sys
sys.path.insert(0, '..')
env = {}
for line in open('../../.env.local', encoding='utf-8'):
    m = re.match(r'^([A-Z_]+)=(.*)$', line.strip())
    if m: env[m.group(1)] = m.group(2).strip().strip('"')
import requests
URL = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1'
H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
def get_all(path, params, page=1000):
    out, off = [], 0
    while True:
        r = requests.get(URL + '/' + path, headers=dict(H, Range=f'{off}-{off+page-1}'), params=dict(params, order='id'), timeout=120)
        r.raise_for_status(); rows = r.json(); out += rows
        if len(rows) < page: return out
        off += len(rows)
T = '55f28144-3d92-484b-a57d-646e06740808'
ms = get_all('matches', {'select': '*', 'tournament_id': 'eq.' + T, 'lineup_home_count': 'gt.0'})
print('partidos con formación', len(ms)); print(sorted(ms[0].keys()))
json.dump(ms, open('db_matches.json', 'w', encoding='utf-8'), ensure_ascii=False)
