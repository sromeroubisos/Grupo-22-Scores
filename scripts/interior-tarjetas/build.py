"""cards.raw.json -> JSON de ficha-partido-local.ts, cruzado con los partidos de la base.

Uso:  python build.py [--out ruta.json]
Lee cards.raw.json (parse.py), baja los partidos 2026 del Interior A y B, cruza cada tarjeta
por fecha + marcador (y nombres si empata), arma eventos y los valida contra el marcador.
Lo que no cierra va a informe.txt; un partido cuyos eventos no suman el marcador entra SIN eventos.
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
from parse import limpiar_nombre  # noqa: E402

PUNTOS = {'try': 5, 'penalty_try': 7, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}
SLUGS = ('torneo-del-interior-a', 'torneo-del-interior-b')
PUESTO = {1: 'Pilar', 2: 'Hooker', 3: 'Pilar', 4: 'Segunda línea', 5: 'Segunda línea', 6: 'Tercera línea',
          7: 'Tercera línea', 8: 'Tercera línea', 9: 'Medio scrum', 10: 'Apertura', 11: 'Wing', 12: 'Centro',
          13: 'Centro', 14: 'Wing', 15: 'Fullback'}
MIN_PLANTEL = 15  # una tarjeta con menos jugadores por lado se descarta
DETALLE = [('juego sucio', 'Juego sucio'), ('scrum', 'Scrum'), ('line', 'Line'), ('disciplina', 'Disciplina'),
           ('juego general', 'Juego general'), ('j. g', 'Juego general'), ('j.g', 'Juego general'),
           ('j. s', 'Juego sucio'), ('s. c', 'Scrum'), ('l. i', 'Line')]
RANGO = {'1T': 0, '2T': 1}


def env():
    e = {}
    for ln in open(os.path.join(ROOT, '.env.local'), encoding='utf8'):
        if '=' in ln and not ln.startswith('#'):
            k, v = ln.rstrip('\n').split('=', 1)
            e[k] = v.strip().strip('"\'')
    return e


def rest(path):
    e = env()
    r = urllib.request.Request(f"{e['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{path}",
                               headers={'apikey': e['SUPABASE_SERVICE_ROLE_KEY'],
                                        'Authorization': f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}"})
    return json.load(urllib.request.urlopen(r))


def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]', '', s)


CLAVES = [  # (todas las palabras en la forma normalizada) -> clave del club; el orden importa
    (('urucure',), 'urucure'), (('curne',), 'curne'), (('athletic',), 'athletic'),
    (('universitario', 'cordoba'), 'uni-cba'), (('universitario', 'tucuman'), 'uni-tuc'),
    (('universitario', 'sanjuan'), 'uni-sj'), (('santafe',), 'sfrc'), (('estudiantes',), 'estudiantes'),
    (('tablada',), 'tablada'), (('jockey', 'cordoba'), 'jcc'), (('jockey', 'rosario'), 'jcr'),
    (('jockey', 'villamaria'), 'jvm'), (('jockey', 'venadotuerto'), 'jcvt'), (('jockey', 'tucuman'), 'jct'),
    (('duendes',), 'duendes'), (('oldresian',), 'oldresian'), (('gim', 'esg'), 'ger'),
    (('gimnasia', 'esgrima'), 'ger'), (('marista',), 'marista'), (('mendoza',), 'mendoza'),
    (('tucuman', 'rugby'), 'trc'), (('tucuman', 'lawn'), 'tltc'), (('natacion',), 'nyg'),
    (('rowing',), 'rowing'), (('crai',), 'crai'), (('cardenales',), 'cardenales'), (('taraguy',), 'taraguy'),
    (('tigres',), 'tigres'), (('palermo',), 'palermo'), (('huirapuca',), 'huirapuca'), (('liceo',), 'liceo'),
    (('tordos',), 'tordos'), (('sportiva',), 'ss'), (('neuquen',), 'neuquen'), (('mardel',), 'mardel'),
    (('sporting',), 'ipr'),
]


def clave(nombre):
    n = norm(nombre)
    for palabras, k in CLAVES:
        if all(p in n for p in palabras):
            return k
    if n.startswith('tala') and 'tablada' not in n:
        return 'tala'
    return n


def bajar_db():
    ts = rest('tournaments?select=id,slug&slug=in.(' + ','.join(SLUGS) + ')')
    ids = ','.join(t['id'] for t in ts)
    slug_de = {t['id']: t['slug'] for t in ts}
    ms = rest(f'matches?tournament_id=in.({ids})&date_time=gte.2026-01-01&status=eq.final'
              '&select=id,tournament_id,date_time,home_club_id,away_club_id,score,referee,lineup_home_count,events_count'
              '&order=date_time&limit=500')
    cids = sorted({c for m in ms for c in (m['home_club_id'], m['away_club_id']) if c})
    clubs = {}
    for i in range(0, len(cids), 80):
        for c in rest('clubs?select=id,name&id=in.(' + ','.join(cids[i:i + 80]) + ')'):
            clubs[c['id']] = c['name']
    for m in ms:
        m['h'] = clubs.get(m['home_club_id'], '')
        m['a'] = clubs.get(m['away_club_id'], '')
        m['torneo'] = slug_de[m['tournament_id']]
        m['sh'] = int((m['score'] or {}).get('home') or 0)
        m['sa'] = int((m['score'] or {}).get('away') or 0)
        d = datetime.fromisoformat(m['date_time'].replace('Z', '+00:00')) - timedelta(hours=3)
        m['fecha'] = d.strftime('%Y-%m-%d')
    return ms


ARREGLOS = {  # el nombre largo se pisa con la columna del DNI en la tarjeta original
    'Gonzalo Thom: Gargallo Bazan': 'Gonzalo Thomas Gargallo Bazan',
    'Gonzalo Thomi Gargallo Bazan': 'Gonzalo Thomas Gargallo Bazan',
    'Lautaro Esteb: Ramirez Juncos': 'Lautaro Esteban Ramirez Juncos',
    'Lautaro Esteb; Ramirez Juncos': 'Lautaro Esteban Ramirez Juncos',
    'Lautaro Esteb Ramirez Juncos': 'Lautaro Esteban Ramirez Juncos',
    'Nestor Santi: Gramajo Brignole': 'Nestor Santiago Gramajo Brignole',
    'Nestor Gramajo Brignole': 'Nestor Santiago Gramajo Brignole',
    'Lautaro S7kuhra': 'Lautaro Szkuhra',
    'Vicente Pe7zutti': 'Vicente Pezzutti',
    'Juan ;Altamirano': 'Juan Altamirano',
}


def nombre_limpio(n):
    n = limpiar_nombre(n)
    return ARREGLOS.get(n, n)


def plegar(n):
    s = unicodedata.normalize('NFD', n or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9 ]', '', s).strip()


def armar_canon(cards):
    """Dentro de un club, un mismo nombre escrito con y sin tilde se unifica en la grafia mas repetida."""
    cuenta = defaultdict(lambda: defaultdict(int))
    for c in cards:
        for lado, pl in zip(('local', 'visitante'), c['plantel']):
            k = clave(c[lado]['nombre'])
            for f in pl:
                n = nombre_limpio(f['nombre'])
                cuenta[(k, plegar(n))][n] += 1
    return {kk: max(v.items(), key=lambda x: (x[1], any(ord(ch) > 127 for ch in x[0])))[0]
            for kk, v in cuenta.items()}


CANON = {}


def lado_plantel(filas, club_clave=None):
    tit, sup, por_dor = [], [], {}
    for f in filas:
        nombre = nombre_limpio(f['nombre'])
        nombre = CANON.get((club_clave, plegar(nombre)), nombre)
        j = {'numero': f['dor'], 'nombre': nombre}
        if f['pos'] <= 15:
            j['puesto'] = PUESTO[f['pos']]
            tit.append(j)
        else:
            sup.append(j)
        if f['dor'] is not None and f['dor'] not in por_dor:
            por_dor[f['dor']] = nombre
    return tit, sup, por_dor


def detalle_tarjeta(obs):
    o = obs.lower()
    for k, v in DETALLE:
        if k in o:
            return v
    return obs.strip()


def linea(d):
    if d is None:
        return None
    return 'f' if (d <= 8 or 16 <= d <= 20) else 'b'


def reparar_dorsal(d, por_dor):
    """151 -> 15, 27 -> (nada): el OCR pega un digito de mas."""
    if d is None or d in por_dor:
        return d
    s = str(d)
    for c in (s[:-1], s[1:]):
        if c.isdigit() and int(c) in por_dor:
            return int(c)
    return d


def eventos_lado(lado, filas, por_dor, avisos, rot):
    """Eventos de un lado, con el minuto relativo del periodo (el script suma 40 al 2T)."""
    evs, outs, ins = [], [], []
    ultimo = None
    for r in filas:
        if r['min'] is None:
            continue
        ultimo = r
    for i, r in enumerate(filas):
        if r['min'] is None:
            vecino = next((x for x in reversed(filas[:i]) if x['min'] is not None and x['per'] == r['per']), None)                 or next((x for x in filas[i + 1:] if x['min'] is not None and x['per'] == r['per']), None)
            if vecino:
                r['min'] = vecino['min']
                r['inferido'] = True
                avisos.append(f'{rot}: minuto ilegible "{r["minRaw"]}", se toma el de la fila vecina ({r["raw"][:50]})')
    for orden, r in enumerate(filas):
        per, minuto = r['per'], r['min']
        if per == 'ET':
            per, minuto = '2T', 0
        elif per == '2T' and minuto is not None and minuto >= 40:
            minuto -= 40
        if minuto is None:
            avisos.append(f'{rot}: minuto ilegible "{r["minRaw"]}" ({r["raw"]})')
            continue
        t, nums = r['tipo'], r['nums']
        if t in PUNTOS:
            if t == 'penalty_try':
                dor = None
            elif len(nums) >= 2:
                dor = nums[-1]
            elif len(nums) == 1 and nums[0] != PUNTOS[t]:
                dor = nums[0]
            else:
                dor = None
            dor = reparar_dorsal(dor, por_dor)
            jug = por_dor.get(dor, '') if dor is not None else ''
            if t != 'penalty_try' and not jug:
                avisos.append(f'{rot}: {t} sin jugador, dorsal {dor} ({r["raw"]})')
            evs.append({'minuto': minuto, 'periodo': per, 'tipo': t, 'equipo': lado, 'jugador': jug, '_o': orden})
        elif t in ('card_yellow', 'card_red', 'injury', 'concussion', 'blue'):
            dor = reparar_dorsal(nums[0] if nums else None, por_dor)
            jug = por_dor.get(dor, '') if dor is not None else ''
            if not jug:
                avisos.append(f'{rot}: {t} sin jugador, dorsal {dor} ({r["raw"]})')
            e = {'minuto': minuto, 'periodo': per, 'tipo': 'injury' if t in ('concussion', 'blue') else t,
                 'equipo': lado, 'jugador': jug, '_o': orden}
            if t in ('card_yellow', 'card_red'):
                d = detalle_tarjeta(r['obs'])
                if d:
                    e['detalle'] = d
            else:
                e['detalle'] = {'concussion': 'Conmoción cerebral', 'blue': 'Tarjeta azul'}.get(t, 'Lesionado')
            evs.append(e)
        elif t == 'out':
            outs.append({'per': per, 'min': minuto, 'dor': reparar_dorsal(nums[0] if nums else None, por_dor), 'o': orden})
        elif t == 'in':
            ins.append({'per': per, 'min': minuto, 'dor': reparar_dorsal(nums[0] if nums else None, por_dor), 'o': orden})
    # Cambios: misma salida y entrada de un periodo y minuto se emparejan en orden; lo que sobra se
    # empareja por periodo y por linea (delanteros con delanteros, backs con backs).
    usados, pares, sueltas = set(), [], []
    por_min = defaultdict(list)
    for i, x in enumerate(ins):
        por_min[(x['per'], x['min'])].append(i)
    for o in outs:
        cand = [i for i in por_min[(o['per'], o['min'])] if i not in usados]
        if cand:
            usados.add(cand[0])
            pares.append((o, ins[cand[0]]))
        else:
            sueltas.append(o)
    resto = [ins[i] for i in range(len(ins)) if i not in usados]
    for o in sueltas:
        cand = [x for x in resto if x['per'] == o['per'] and linea(x['dor']) == linea(o['dor'])]
        cand = cand or [x for x in resto if x['per'] == o['per']]
        if cand:
            resto.remove(cand[0])
            pares.append((o, cand[0]))
        else:
            avisos.append(f'{rot}: salida sin reemplazo, dorsal {o["dor"]} ({o["per"]} {o["min"]})')
    for x in resto:
        avisos.append(f'{rot}: ingreso sin salida, dorsal {x["dor"]} ({x["per"]} {x["min"]})')
    for o, i in pares:
        sale, entra = por_dor.get(o['dor'], ''), por_dor.get(i['dor'], '')
        if not sale or not entra:
            avisos.append(f'{rot}: cambio con dorsal sin jugador {o["dor"]}->{i["dor"]}')
            continue
        evs.append({'minuto': i['min'], 'periodo': i['per'], 'tipo': 'substitution', 'equipo': lado,
                    'jugador': sale, 'detalle': f'Entra: {entra}', '_o': min(o['o'], i['o'])})
    return evs


def armar(card):
    pl = card['plantel']
    if len(pl) < 2 or len(pl[0]) < MIN_PLANTEL or len(pl[1]) < MIN_PLANTEL:
        return None
    avisos = []
    tl, sl, dl = lado_plantel(pl[0], clave(card['local']['nombre']))
    tv, sv, dv = lado_plantel(pl[1], clave(card['visitante']['nombre']))
    rot = (f"{card['local']['nombre']} {card['local']['score']}-{card['visitante']['score']} "
           f"{card['visitante']['nombre']} ({card['numero']})")
    evs = eventos_lado('local', card['inc']['local'], dl, avisos, rot) + \
        eventos_lado('visitante', card['inc']['visitante'], dv, avisos, rot)
    evs.sort(key=lambda e: (RANGO[e['periodo']], e['minuto'], e['_o']))
    tot = {'local': 0, 'visitante': 0}
    for e in evs:
        tot[e['equipo']] += PUNTOS.get(e['tipo'], 0)
    return {'rot': rot, 'tl': tl, 'sl': sl, 'tv': tv, 'sv': sv, 'evs': evs, 'avisos': avisos, 'tot': tot}


def personas_de(club_id, cache={}):
    if club_id not in cache:
        filas, off = [], 0
        while True:
            r = rest(f'people?club_id=eq.{club_id}&select=id,full_name&order=id&limit=1000&offset={off}')
            filas += r
            if len(r) < 1000:
                break
            off += 1000
        por = defaultdict(list)
        for p in filas:
            por[plegar(p['full_name'])].append(p)
        cache[club_id] = por
    return cache[club_id]


def uso_de_fichas(club_id, cache={}):
    """Cuantas formaciones ya usan cada ficha del club: la mas usada es la que acumula la historia."""
    if club_id not in cache:
        uso = defaultdict(int)
        ms = rest(f'matches?select=lineups,home_club_id,away_club_id&or=(home_club_id.eq.{club_id},away_club_id.eq.{club_id})'
                  '&or=(lineup_home_count.gt.0,lineup_away_count.gt.0)&limit=1000')
        for m in ms:
            lado = 'home' if m['home_club_id'] == club_id else 'away'
            for j in ((m.get('lineups') or {}).get(lado) or []):
                if j.get('id'):
                    uso[j['id']] += 1
        cache[club_id] = uso
    return cache[club_id]


def fijar_ids(jugadores, club_id, informe, rot):
    por = personas_de(club_id)
    nuevos = 0
    for j in jugadores:
        cand = por.get(plegar(j['nombre']), [])
        if not cand:
            nuevos += 1
            continue
        if len(cand) > 1:
            uso = uso_de_fichas(club_id)
            cand = sorted(cand, key=lambda p: (-uso.get(p['id'], 0), p['full_name'] != j['nombre'], p['id']))
        else:
            exacto = [p for p in cand if p['full_name'] == j['nombre']]
            cand = exacto or cand
        j['id'] = cand[0]['id']
    return nuevos


def main():
    out = os.path.join(ROOT, 'src', 'scripts', 'formaciones', '2026-10-21-interior-tarjetas.json')
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    cards = json.load(open(os.path.join(AQUI, 'cards.raw.json'), encoding='utf8'))
    CANON.update(armar_canon(cards))
    ms = bajar_db()
    with open(os.path.join(AQUI, 'db_matches.json'), 'w', encoding='utf8') as fh:
        json.dump(ms, fh, ensure_ascii=False, indent=1)
    print(len(ms), 'partidos en la base')

    por_num = defaultdict(list)
    for c in cards:
        por_num[c['numero']].append(c)
    informe, partidos, usados = [], [], {}
    nuevas = 0
    for num, lst in sorted(por_num.items()):
        mejor = None
        for c in lst:
            r = armar(c)
            if r is None:
                continue
            ok = (r['tot']['local'], r['tot']['visitante']) == (c['local']['score'], c['visitante']['score'])
            punt = (ok, -len(r['avisos']))
            if mejor is None or punt > mejor[0]:
                mejor = (punt, c, r)
        if mejor is None:
            informe.append(f'{num}: sin plantel utilizable ({lst[0]["archivo"]})')
            continue
        _, c, r = mejor
        a, b = c['local']['score'], c['visitante']['score']
        kl, kv = clave(c['local']['nombre']), clave(c['visitante']['nombre'])
        cand = [m for m in ms if m['fecha'] == c['fecha'] and {clave(m['h']), clave(m['a'])} == {kl, kv}]
        if not cand:
            informe.append(f'{num}: SIN CRUCE {r["rot"]} {c["fecha"]} claves {kl}/{kv} ({c["archivo"]})')
            continue
        m = cand[0]
        invertida = clave(m['h']) != kl
        esperado = (m['sh'], m['sa']) if not invertida else (m['sa'], m['sh'])
        if esperado != (a, b):
            informe.append(f'{num}: MARCADOR DISTINTO tarjeta {a}-{b} vs base {esperado[0]}-{esperado[1]} '
                           f'({r["rot"]})')
        if m['id'] in usados:
            informe.append(f'{num}: partido de la base ya usado por {usados[m["id"]]} ({r["rot"]})')
            continue
        usados[m['id']] = num
        ok_ev = (r['tot']['local'], r['tot']['visitante']) == esperado
        if not ok_ev:
            informe.append(f'{num}: EVENTOS NO CIERRAN {r["rot"]}: eventos {r["tot"]["local"]}-{r["tot"]["visitante"]} '
                           f'({c["archivo"]})')
        for av in r['avisos']:
            informe.append('  aviso ' + av)
        tl, sl, tv, sv, evs = r['tl'], r['sl'], r['tv'], r['sv'], r['evs']
        if invertida:
            tl, sl, tv, sv = tv, sv, tl, sl
            for e in evs:
                e['equipo'] = 'visitante' if e['equipo'] == 'local' else 'local'
            informe.append(f'{num}: orientacion invertida respecto de la base ({r["rot"]})')
        eventos = [{k: v for k, v in e.items() if k != '_o'} for e in evs]
        nl = fijar_ids(tl + sl, m['home_club_id'], informe, r['rot'])
        nv = fijar_ids(tv + sv, m['away_club_id'], informe, r['rot'])
        nuevas += nl + nv
        p = {'id': m['id'], 'rotulo': f"{m['h']} vs {m['a']} · {m['torneo']} · tarjeta {num}",
             'local': {'nombre': m['h'], 'titulares': tl, 'suplentes': sl},
             'visitante': {'nombre': m['a'], 'titulares': tv, 'suplentes': sv},
             'eventos': eventos if ok_ev else []}
        if c['arbitro'] and not (m.get('referee') or '').strip():
            p['arbitro'] = c['arbitro']
        partidos.append(p)
    sin_tarjeta = [m for m in ms if m['id'] not in usados]
    informe.append('')
    informe.append(f'Partidos de la base SIN tarjeta: {len(sin_tarjeta)}')
    for m in sin_tarjeta:
        informe.append(f"  {m['fecha']} {m['torneo'][-1].upper()} {m['h']} {m['sh']}-{m['sa']} {m['a']}")
    with open(os.path.join(AQUI, 'informe.txt'), 'w', encoding='utf8') as fh:
        fh.write('\n'.join(informe))
    with open(out, 'w', encoding='utf8') as fh:
        json.dump({'descripcion': 'Torneo del Interior A y B 2026 · tarjetas UCR (texto OCR, validado contra el marcador de la base)',
                   'torneo': 'Torneo del Interior', 'partidos': partidos}, fh, ensure_ascii=False, indent=1)
    print(len(partidos), 'partidos armados ->', out, '· fichas nuevas a crear:', nuevas)
    print('\n'.join(informe))


if __name__ == '__main__':
    main()
