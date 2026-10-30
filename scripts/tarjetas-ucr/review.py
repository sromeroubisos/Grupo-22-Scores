import json, collections
cs=json.load(open('cards.json',encoding='utf-8'))
tot=collections.Counter(); rows=[]
for x in cs:
    probs=[]
    for lado,evs in (('L',x['ev_local']),('V',x['ev_visit'])):
        for e in evs:
            if e['tipo']!='substitution' and e['dor'] is None and e['tipo'] not in ('substitution',): probs.append((lado,'sin dorsal',e['tipo'],e['tiempo'],e['abs'],e['raw']))
            elif e['tipo'] in ('try','conversion','penalty_goal','penalty_try','drop_goal','card_yellow','card_red','injury') and e['jugador'] is None: probs.append((lado,'dorsal sin jugador',e['tipo'],e['dor']))
            if e.get('abs') is None: probs.append((lado,'sin minuto',e['tipo'],e['raw']))
    for n in x['notes']:
        if n[1]!='fila rara': probs.append(n)
    for p in x['local']+x['visit']:
        if p['warn'] and p['dor']!=p['pos']: probs.append(('roster dorsal dudoso',p['name'],p['dor']))
    if probs: rows.append((x['file'],probs))
    for p in probs: tot[p[1] if len(p)>1 and isinstance(p[1],str) else p[0]]+=1
print(len(rows),'tarjetas con algo para revisar de',len(cs)); print(tot)
for f,p in rows[:200]:
    print(f); [print('   ',q) for q in p]
