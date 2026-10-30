import json, re, unicodedata, collections
exec(open('comparar.py', encoding='utf-8').read().split("T = '55f28")[0])
T = '55f28144-3d92-484b-a57d-646e06740808'
ms = json.load(open('db_matches.json', encoding='utf-8')); cards = json.load(open('cards.json', encoding='utf-8'))
print('official_sheet_number ejemplos:', [m['official_sheet_number'] for m in ms[:5]])
def sc(m):
    s = m.get('score') or {}
    return (s.get('home'), s.get('away'))
bynum = {str(m['official_sheet_number']): m for m in ms if m.get('official_sheet_number')}
print('con sheet', len(bynum))
def fold(s): return re.sub(r'[^a-z ]', '', ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn'))
ev = []
ids = [m['id'] for m in ms]
for i in range(0, len(ids), 40):
    ev += get_all('match_events', {'select': 'id,match_id,player_id,player_name,event_type,minute,team_id,details', 'match_id': 'in.(' + ','.join(ids[i:i+40]) + ')'})
evm = collections.defaultdict(list)
for e in ev: evm[e['match_id']].append(e)
rep = []
sinmatch = []
for c in cards:
    m = bynum.get(c['num'])
    if not m:
        # por fecha y marcador
        d = c['juego'][:10]; d = d[6:] + '-' + d[3:5] + '-' + d[:2]
        pts = (c['equipos'][0]['pts'], c['equipos'][1]['pts'])
        cand = [x for x in ms if x['date_time'][:10] in (d,) and sc(x) == pts]
        m = cand[0] if len(cand) == 1 else None
    if not m: sinmatch.append(c['num']); continue
    e = evm[m['id']]
    npt = lambda inc: sum(1 for f in inc if re.match(r'(Try|Conversi|Penal$|Penales|Drop)', f[3]) or f[3].lower().startswith('try'))
    card_pts = sum(1 for k in 'LV' for f in c['inc'][k] if f[3].split()[0].lower() in ('try', 'conversión', 'conversion', 'penal', 'drop'))
    db_pts = sum(1 for x in e if x['event_type'] in ('try', 'penalty_try', 'conversion', 'penalty_goal', 'drop_goal'))
    sinj = sum(1 for x in e if not x['player_id'] and x['event_type'] in ('try', 'conversion', 'penalty_goal', 'drop_goal'))
    lh = len((m['lineups'] or {}).get('home') or []); la = len((m['lineups'] or {}).get('away') or [])
    rep.append((c['num'], m['id'][:8], card_pts, db_pts, sinj, lh, la, len(c['ros']['L']), len(c['ros']['V']), len(e), sum(len(c['inc'][k]) for k in 'LV')))
print('tarjetas sin partido en base:', sinmatch)
print('num db_id card_pts db_pts sinjugador lineH lineA cardH cardA db_ev card_inc')
dist = [r for r in rep if r[2] != r[3] or r[4] or r[5] != r[7] or r[6] != r[8]]
print(len(rep), 'cruzadas; con diferencia:', len(dist))
for r in dist[:60]: print(r)
json.dump(rep, open('rep.json', 'w'))
