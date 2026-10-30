import json, os, urllib.request
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
env = {}
for l in open(os.path.join(ROOT, '.env.local'), encoding='utf8'):
    if '=' in l and not l.startswith('#'):
        k, v = l.rstrip('\n').split('=', 1); env[k] = v.strip().strip('"\'')
URL, KEY = env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']
SEASON = 'a41f13a6-0c70-4ab1-9dd7-dc1a68df28c0'
def get(path):
    r = urllib.request.Request(f'{URL}/rest/v1/{path}', headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    return json.load(urllib.request.urlopen(r))
if __name__ == '__main__':
    rows = get(f'matches?season_id=eq.{SEASON}&select=id,date_time,home_club_id,away_club_id,score,status,referee,venue,home_base_points,away_base_points,home_bonus_points,away_bonus_points&order=date_time,id&limit=100')
    json.dump(rows, open('db_matches.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(rows))
