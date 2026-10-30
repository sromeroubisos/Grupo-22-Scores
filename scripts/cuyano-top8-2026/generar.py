"""Arma el JSON de fichas del Top 8 Cuyano 2026 para src/scripts/ficha-partido-local.ts.

Entradas: fichas.json (parse_fichas.py: 12 partidos con formaciones y cronograma), prosa.py (36
partidos solo con cronica), numeros.json (goleadores y tryman de la fuente, para canonizar
nombres y contrastar), db_matches.json (dbfetch.py: ids y marcadores de la base).
Regla: los eventos de cada partido TIENEN que sumar el marcador. Si no, el partido no sale."""
import json, os, re, sys, unicodedata
from collections import Counter, defaultdict
from prosa import PROSA

AQUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(AQUI, '..', '..'))
SALIDA = os.path.join(ROOT, 'src', 'scripts', 'formaciones', '2026-10-21-cuyano-top8-2026.json')

CLUB = {'TEQ': 'teque-r-c', 'TOR': 'los-tordos-rugby-club', 'SJ': 'san-juan-rugby-club', 'CPBM': 'c-p-b-m',
        'MEN': 'mendoza-rugby-club', 'LIC': 'liceo-rugby-club', 'UNI': 'universitario-de-san-juan', 'MAR': 'marista-rugby-club'}
POR_CLUB = {v: k for k, v in CLUB.items()}
NOMBRE = {'TEQ': 'Teqüe', 'TOR': 'Los Tordos', 'SJ': 'San Juan', 'CPBM': 'CPBM', 'MEN': 'Mendoza', 'LIC': 'Liceo',
          'UNI': 'Universitario SJ', 'MAR': 'Marista'}
CLUB_NUMEROS = {'SAN JUAN': 'SJ', 'CPBM': 'CPBM', 'LOS TORDOS': 'TOR', 'LICEO': 'LIC', 'MENDOZA': 'MEN',
                'UNIVERSITARIO SJ': 'UNI', 'TEQÜE': 'TEQ', 'MARISTA': 'MAR'}
FICHAS = {'01-mendoza-liceo': ('MEN', 'LIC'), '02-tordos-marista': ('TOR', 'MAR'), '03-teque-liceo': ('TEQ', 'LIC'),
          '04-tordos-liceo': ('TOR', 'LIC'), '05-mendoza-marista': ('MEN', 'MAR'), '06-marista-liceo': ('MAR', 'LIC'),
          '07-tordos-mendoza': ('TOR', 'MEN'), '08-liceo-mendoza': ('LIC', 'MEN'), '09-marista-tordos': ('MAR', 'TOR'),
          '10-liceo-teque': ('LIC', 'TEQ'), '11-liceo-tordos': ('LIC', 'TOR'), '12-marista-mendoza': ('MAR', 'MEN')}
# El marcador de la base esta mal en dos partidos: la tabla oficial, la cronica y los eventos coinciden entre si.
MARCADOR_FUENTE = {('SJ', 'TOR'): (32, 66), ('MAR', 'TEQ'): (33, 19)}
PUNTOS = {'try': 5, 'penalty_try': 7, 'conversion': 2, 'penalty_goal': 3, 'drop_goal': 3}


def fold(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s.upper().replace('.', ' ')).strip()


numeros = json.load(open(os.path.join(AQUI, 'numeros.json'), encoding='utf8'))
CANON = {}  # (club, fold) -> nombre tal como lo escribe la fuente en goleadores/tryman
for fila in numeros['goleadores']:
    CANON[(CLUB_NUMEROS[fila[2]], fold(fila[1]))] = fila[1]
for fila in numeros['tryman']:
    CANON[(CLUB_NUMEROS[fila[2]], fold(fila[1]))] = fila[1]
# variantes de escritura entre la cronica y las tablas de la fuente
# Variantes de la fuente (erratas de tipeo entre sus propias tablas y fichas) -> una sola forma.
UNIFICAR = {
    ('SJ', 'ESTILIANO BATEZZATTI'): 'ESTILIANO BATTEZZATI',
    ('CPBM', 'FRAN GARCIA SALAZAR'): 'FRANCISCO GARCÍA SALAZAR',
    ('CPBM', 'FRANCISCO GARCIA SALAZAR'): 'FRANCISCO GARCÍA SALAZAR',
    ('TEQ', 'ESTEBAN FERNAMDEZ'): 'ESTEBAN FERNÁNDEZ',
    ('UNI', 'JUAN I DEL CARRIL'): 'JUAN IGNACIO DEL CARRIL',
    ('MAR', 'BENAJMIN FILIZZOLA'): 'BENJAMÍN FILIZZOLA',
    ('MAR', 'BENJAMIN FILIZZOLA'): 'BENJAMÍN FILIZZOLA',
    ('CPBM', 'JUAN PABLO MONTILLA'): 'JUAN MANUEL MONTILLA',   # la cronica de la F7 dice Juan Pablo; goleadores/tryman de la fuente, Juan Manuel
    ('TOR', 'VALENTIN MIRANDA'): 'VALENTINO MIRANDA',          # la ficha del partido (F4) dice Valentino
}
CANON.update(UNIFICAR)


def canon(club, nombre):
    return CANON.get((club, fold(nombre)), None)


def unico(club, nombre):
    """Misma persona = mismo string en todo el torneo (las estadisticas se agrupan por nombre)."""
    return canon(club, nombre) or nombre


db = {(POR_CLUB[r['home_club_id']], POR_CLUB[r['away_club_id']]): r
      for r in json.load(open(os.path.join(AQUI, 'db_matches.json'), encoding='utf8')) if r['status'] == 'final'}
fichas = json.load(open(os.path.join(AQUI, 'fichas.json'), encoding='utf8'))

avisos = []

# Casos que el resolvedor no puede decidir solo (tipeo de la fuente o iniciales repetidas), resueltos mirando
# los totales de goleadores/tryman de la propia fuente. (ficha, token) -> nombre
OVERRIDE = {
    ('09-marista-tordos', 'GLADEANO'): 'FRANCISCO GALDEANO',
    ('09-marista-tordos', 'B FILIZZOLA'): 'BORJA FILIZZOLA',      # Benjamin ya tiene su unico try en la cronica de la F3
    ('09-marista-tordos', 'LABORDE'): 'IGNACIO LABORDE',
    ('10-liceo-teque', 'KRETSCHMAR'): 'AUGUSTO KRETSCHMAR',
    ('02-tordos-marista', 'B FILIZZOLA'): 'BAUTISTA FILIZZOLA',   # pateador (penal y 3 conversiones); Benjamin es el try
}


def resolver(token, jugadores, club, ctx):
    """token del cronograma ('F SERPA', 'LIZZOLA', 'JM SANCHO') -> nombre de la formacion."""
    t = fold(token)
    if not t:
        return None
    partes = t.split()
    cand = []
    for n in jugadores:
        fp = fold(n).split()
        if fold(n) == t:
            return n
        if len(partes) == 1:
            if partes[0] in fp:
                cand.append(n)
        else:
            ini, resto = partes[0], partes[1:]
            if len(ini) <= 2 and fp[-len(resto):] == resto and len(fp) > len(resto):
                nombres = fp[:-len(resto)]
                if nombres[0][0] == ini[0]:
                    cand.append(n)
            elif fp[-len(partes):] == partes:
                cand.append(n)
    if len(cand) == 1:
        return cand[0]
    if len(cand) > 1:
        exactos = [n for n in cand if fold(n).split()[-1] == partes[-1]]
        if len(exactos) == 1:
            return exactos[0]
    avisos.append(f'{ctx}: "{token}" -> {len(cand)} candidatos {cand}')
    return None


partidos = []
tally = defaultdict(Counter)     # (club, jugador plegado) -> tipo -> n
tally_eq = defaultdict(Counter)  # club -> tipo -> n


def sumar(eventos, club_de_lado):
    for e in eventos:
        c = club_de_lado[e['equipo']]
        tally_eq[c][e['tipo']] += 1
        if e['jugador']:
            tally[(c, fold(e['jugador']))][e['tipo']] += 1


def marcador(eventos):
    r = {'local': 0, 'visitante': 0}
    for e in eventos:
        r[e['equipo']] += PUNTOS.get(e['tipo'], 0)
    return r['local'], r['visitante']


# ---------- 12 partidos con ficha ----------
for clave, (h, a) in FICHAS.items():
    f = fichas[clave + '.html']
    fila = db[(h, a)]
    esperado = MARCADOR_FUENTE.get((h, a), (fila['score']['home'], fila['score']['away']))
    lados = {'local': h, 'visitante': a}
    titulares, ingresaron, nombres, capitanes = {}, {}, {}, set()
    for lado, club in lados.items():
        d = f[lado]
        for n, nombre in d['titulares']:
            if re.search(r'\(C\)', nombre):
                capitanes.add((lado, n))
        titulares[lado] = [(n, unico(club, re.sub(r'\s*\|?\s*\(C\)', '', nombre).strip())) for n, nombre in d['titulares']]
        ingresaron[lado] = [canon(club, x) or x for x in d['ingresaron']]
        nombres[lado] = [n for _, n in titulares[lado]] + ingresaron[lado]
    eventos = []
    for e in f['eventos']:
        club = lados[e['equipo']]
        tipo = {'TRY': 'try', 'TRY PENAL': 'penalty_try', 'PENAL': 'penalty_goal', 'DROP': 'drop_goal'}[e['tipo']]
        ctx = f'{clave} {e["periodo"]} {e["minuto"]}'
        jug = (OVERRIDE.get((clave, fold(e['jugador']))) or resolver(e['jugador'], nombres[e['equipo']], club, ctx)) if e['jugador'] else ''
        eventos.append({'minuto': e['minuto'], 'periodo': e['periodo'], 'tipo': tipo, 'equipo': e['equipo'], 'jugador': jug or ''})
        if e['conv']:
            c = OVERRIDE.get((clave, fold(e['conv']))) or resolver(e['conv'], nombres[e['equipo']], club, ctx + ' conv')
            eventos.append({'minuto': e['minuto'], 'periodo': e['periodo'], 'tipo': 'conversion', 'equipo': e['equipo'], 'jugador': c or ''})
    # tarjetas: la fuente no da minuto
    for lado, club in lados.items():
        for nom in f[lado]['amonestados']:
            j = resolver(nom, nombres[lado], club, f'{clave} amarilla') or nom
            eventos.append({'minuto': 0, 'periodo': '1T', 'tipo': 'card_yellow', 'equipo': lado, 'jugador': j})
        for nom in f[lado]['expulsados']:
            j = resolver(nom, nombres[lado], club, f'{clave} roja') or nom
            eventos.append({'minuto': 0, 'periodo': '1T', 'tipo': 'card_red', 'equipo': lado, 'jugador': j})
    got = marcador(eventos)
    if got != esperado:
        avisos.append(f'!! {clave}: eventos {got} vs esperado {esperado}')
        continue
    sumar(eventos, lados)
    partidos.append({
        'id': fila['id'],
        'rotulo': f'F{int(clave[:2])} · {NOMBRE[h]} {esperado[0]}-{esperado[1]} {NOMBRE[a]}',
        'arbitro': f['arbitro'],
        'cancha': f['cancha'],
        'local': {'nombre': NOMBRE[h], 'titulares': [{'numero': n, 'nombre': nom, **({'capitan': True} if ('local', n) in capitanes else {})} for n, nom in titulares['local']],
                  'suplentes': [{'nombre': x} for x in ingresaron['local']]},
        'visitante': {'nombre': NOMBRE[a], 'titulares': [{'numero': n, 'nombre': nom, **({'capitan': True} if ('visitante', n) in capitanes else {})} for n, nom in titulares['visitante']],
                      'suplentes': [{'nombre': x} for x in ingresaron['visitante']]},
        'eventos': eventos,
        'marcadorFuente': list(esperado) if (h, a) in MARCADOR_FUENTE else None,
    })

# ---------- 36 partidos solo con cronica ----------
for (h, a), datos in PROSA.items():
    fila = db[(h, a)]
    esperado = MARCADOR_FUENTE.get((h, a), (fila['score']['home'], fila['score']['away']))
    lados = {'local': h, 'visitante': a}
    eventos = []
    for lado, club in lados.items():
        d = datos[club]

        def nom(x, club=club):
            if x is None:
                return ''
            c = canon(club, x)
            if not c:
                avisos.append(f'F{datos["fecha"]} {club}: nombre sin canon en tablas de la fuente: {x}')
                return x.upper()
            return c

        def ev(tipo, jugador, lado=lado):
            return {'minuto': 0, 'periodo': '1T', 'tipo': tipo, 'equipo': lado, 'jugador': jugador}

        for j, n in d.get('T', []):
            eventos += [ev('try', nom(j)) for _ in range(n)]
        eventos += [ev('penalty_try', '') for _ in range(d.get('TP', 0))]
        for j, n in d.get('C', []):
            eventos += [ev('conversion', nom(j)) for _ in range(n)]
        for j, n in d.get('P', []):
            eventos += [ev('penalty_goal', nom(j)) for _ in range(n)]
        for j, n in d.get('D', []):
            eventos += [ev('drop_goal', nom(j)) for _ in range(n)]
        eventos += [ev('card_yellow', '') for _ in range(d.get('Y', 0))]
        eventos += [ev('card_red', '') for _ in range(d.get('R', 0))]
    got = marcador(eventos)
    if got != esperado:
        avisos.append(f'!! F{datos["fecha"]} {h}-{a}: eventos {got} vs esperado {esperado}')
        continue
    sumar(eventos, lados)
    partidos.append({
        'id': fila['id'],
        'rotulo': f'F{datos["fecha"]} · {NOMBRE[h]} {esperado[0]}-{esperado[1]} {NOMBRE[a]}',
        'local': {'nombre': NOMBRE[h], 'sinDatos': True, 'titulares': []},
        'visitante': {'nombre': NOMBRE[a], 'sinDatos': True, 'titulares': []},
        'eventos': eventos,
        'marcadorFuente': list(esperado) if (h, a) in MARCADOR_FUENTE else None,
    })

def oracion(n):
    return n.title() if n and n == n.upper() else n


for p in partidos:
    for lado in ('local', 'visitante'):
        for j in p[lado].get('titulares', []) + p[lado].get('suplentes', []):
            j['nombre'] = oracion(j['nombre'])
    for e in p['eventos']:
        e['jugador'] = oracion(e['jugador'])
    if p.get('arbitro'):
        p['arbitro'] = oracion(p['arbitro'])

orden = {r['id']: i for i, r in enumerate(sorted(db.values(), key=lambda r: (r['date_time'], r['id'])))}
partidos.sort(key=lambda p: orden[p['id']])

# ---------- contraste con goleadores y tryman de la fuente ----------
print('\n== contraste con la fuente (solo diferencias) ==')
dif = 0
for fila in numeros['tryman']:
    club = CLUB_NUMEROS[fila[2]]
    mio = tally[(club, fold(unico(club, fila[1])))]['try']
    if mio != int(fila[3]):
        dif += 1
        print(f'  tries {fila[1]} ({club}): mio {mio} fuente {fila[3]}')
vistos = {(CLUB_NUMEROS[f[2]], fold(unico(CLUB_NUMEROS[f[2]], f[1]))) for f in numeros['tryman']}
for (club, nom), c in sorted(tally.items()):
    if c['try'] and (club, nom) not in vistos:
        dif += 1
        print(f'  tries {nom} ({club}): mio {c["try"]} y no esta en el tryman')
for fila in numeros['goleadores']:
    club = CLUB_NUMEROS[fila[2]]
    c = tally[(club, fold(unico(club, fila[1])))]
    mio = (c['penalty_goal'], c['conversion'], c['drop_goal'])
    src = (int(fila[3]), int(fila[4]), int(fila[5]))
    if mio != src:
        dif += 1
        print(f'  patadas {fila[1]} ({club}): mio P/C/D {mio} fuente {src}')
print('  diferencias:', dif)
print('\n== por equipo: mio vs tabla de la fuente (tries / try penal / conv / penales / drops) ==')
alias_eq = {'LOS TORDOS': 'TOR', 'LICEO': 'LIC', 'MARISTA': 'MAR', 'UNIVERSITARIO SJ': 'UNI', 'MENDOZA': 'MEN',
            'SAN JUAN': 'SJ', 'CPBM': 'CPBM', 'TEQÜE': 'TEQ'}
for r in numeros['equipos_total'][1:-1]:
    c = tally_eq[alias_eq[r[0]]]
    print(f'  {r[0]:18} mio {c["try"]}/{c["penalty_try"]}/{c["conversion"]}/{c["penalty_goal"]}/{c["drop_goal"]}  fuente {r[2]}/{r[3]}/{r[4]}/{r[5]}/{r[6]}')

print('\n== avisos ==')
for x in avisos:
    print(' ', x)
print(f'\npartidos listos: {len(partidos)} de 48')
if '--escribir' in sys.argv:
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump({'descripcion': 'Top 8 Cuyano 2026 (Copa Oro del Oeste) · 12 fichas completas + 36 desde la cronica de rugbydecuyo.com.ar',
               'torneo': 'a41f13a6-0c70-4ab1-9dd7-dc1a68df28c0', 'partidos': partidos},
              open(SALIDA, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print('escrito', SALIDA)
