"""Cuadros de playoff de los torneos cordobeses 2026 (M19 "A", Preintermedia "A", Intermedia).

Uso:  python arreglar.py m19|pre-a|intermedia [--execute]      (sin --execute: solo imprime el plan)

Arma a mano, alrededor de partidos ya jugados, lo mismo que genera playoffBracket.ts: una copa
(tournament_groups), rondas con group_id, partidos con bracket_match_code + participant_source y reglas de
avance (ganador/perdedor -> partido siguiente). NO pasa por generatePlayoffBracket porque borra los partidos
de la fase y recrea con fecha de relleno. Semis y final tienen que vivir en la MISMA fase: el tablero
(loadPlayoffBracket) y las reglas van acotados por fase.

m19:  final + semis en una fase "Playoffs"; los partidos REC pasan a una fase propia "REC*" (tabla aparte,
      no suma al campeonato); el Campeonato queda con las 18 fechas y tabla automatica; bandas por puesto.
pre-a / intermedia: semis + final (+ 3.º puesto en Intermedia) en una fase "Playoffs".
Antes de borrar o mover algo se guarda un respaldo JSON en esta carpeta.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
import build  # noqa: E402

EJECUTAR = '--execute' in sys.argv
E = build.env()
BASE = E['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/'
KEY = E['SUPABASE_SERVICE_ROLE_KEY']


def api(metodo, ruta, cuerpo=None):
    ruta = urllib.parse.quote(ruta, safe="/?=&,.()*:!%<>")
    r = urllib.request.Request(BASE + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                               headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json',
                                        'Prefer': 'return=representation'})
    try:
        txt = urllib.request.urlopen(r).read().decode()
    except urllib.error.HTTPError as ex:
        raise SystemExit(f'FALLÓ {metodo} {ruta}: {ex.code} {ex.read().decode()[:500]}')
    return json.loads(txt) if txt else []


def leer(ruta):
    return api('GET', ruta)


def escribir(metodo, ruta, cuerpo=None, nota=''):
    print(('  ' if EJECUTAR else '  [plan] ') + f'{metodo} {ruta.split("?")[0]} {nota}')
    if not EJECUTAR:
        return [{'id': 'PLAN'}]
    return api(metodo, ruta, cuerpo)


def respaldo(nombre, datos):
    if EJECUTAR:
        with open(os.path.join(AQUI, f'respaldo-{nombre}.json'), 'w', encoding='utf8') as fh:
            json.dump(datos, fh, ensure_ascii=False, indent=1)
        print(f'  respaldo-{nombre}.json')


def src(tipo, ref):
    return {'type': tipo, 'ref': ref}


def copa(fase_id):
    g = escribir('POST', 'tournament_groups', {'phase_id': fase_id, 'name': 'Copa', 'order_index': 0}, '"Copa"')
    return g[0]['id']


def renombrar_fase(fase_id, nombre):
    s = leer(f'tournament_phases?id=eq.{fase_id}&select=settings')[0]['settings'] or {}
    s['bracketMode'] = 'auto'
    escribir('PATCH', f'tournament_phases?id=eq.{fase_id}', {'name': nombre, 'settings': s}, f'-> "{nombre}", bracketMode auto')


def partido_llave(mid, grupo, codigo, local, visita, etiquetas=(None, None), extra=None):
    cuerpo = {'group_id': grupo, 'bracket_match_code': codigo, 'participant_source': {'home': local, 'away': visita},
              'home_source_label': etiquetas[0], 'away_source_label': etiquetas[1]}
    cuerpo.update(extra or {})
    escribir('PATCH', f'matches?id=eq.{mid}', cuerpo, codigo)


def reglas(fase_id, grupo, lista):
    filas = [{'phase_id': fase_id, 'source_match_id': o, 'outcome': res, 'target_match_id': d, 'target_slot': slot,
              'target_group_id': grupo} for o, res, d, slot in lista]
    escribir('POST', 'tournament_match_advancement_rules', filas, f'{len(filas)} reglas')


def partido_nuevo(molde, fase, ronda, grupo, codigo, local_club, visita_club, local, visita, etiquetas, fecha, nota):
    fila = {k: molde[k] for k in ('tournament_id', 'season_id', 'sport', 'sport_id', 'category') if molde.get(k) is not None}
    fila.update({'phase_id': fase, 'round_uuid': ronda, 'round_label': None, 'group_id': grupo, 'home_club_id': local_club,
                 'away_club_id': visita_club, 'date_time': fecha, 'status': 'scheduled', 'score': {'home': 0, 'away': 0},
                 'bracket_match_code': codigo, 'home_source_label': etiquetas[0], 'away_source_label': etiquetas[1],
                 'participant_source': {'home': local, 'away': visita}, 'is_visible': False, 'notes': nota})
    return escribir('POST', 'matches', fila, f'{codigo} (nuevo, oculto)')[0]['id']


def ronda_nueva(fase, nombre, orden, grupo, season):
    fila = {'phase_id': fase, 'name': nombre, 'order_index': orden, 'group_id': grupo}
    if season:
        fila['season_id'] = season
    return escribir('POST', 'tournament_rounds', fila, f'"{nombre}"')[0]['id']


def tid_de(slug):
    return leer(f'tournaments?select=id&slug=eq.{slug}')[0]['id']


# --------------------------------------------------------------------------------------------- m19
def m19():
    SEMIS, FINAL_FASE, CAMP = '7d5bc226-4a11-42a7-b4bc-c5310c0f66f7', '9633d72a-bf47-4476-bcb1-4bf164d25b06', 'ecf96450-d341-4aac-a0f3-3457bef8c569'
    R_SEMI, R_FINAL = '639b58b8-e576-49d7-a3db-08e5a94c83bc', '16c39a93-b7d8-4e92-b588-18a8359c2543'
    SF1, SF2, FIN = 'a4bfc7cf-7621-4493-892d-efe7ab6f20b4', 'a3eebace-de23-418c-9432-5d7d13da2f40', 'bf3f3eb7-c7d8-460c-a796-970983e1c589'
    t = tid_de('torneo-cordobes-m19-a')
    print('== M19: cuadro (semis + final en una fase)')
    respaldo('m19-cuadro', {'fases': leer(f'tournament_phases?tournament_id=eq.{t}&select=*'),
                            'rondas': leer(f'tournament_rounds?id=in.({R_SEMI},{R_FINAL})&select=*'),
                            'partidos': leer(f'matches?id=in.({SF1},{SF2},{FIN})&select=*')})
    g = copa(SEMIS)
    renombrar_fase(SEMIS, 'Playoffs')
    escribir('PATCH', f'tournament_rounds?id=eq.{R_SEMI}', {'group_id': g}, 'Semifinales -> copa')
    escribir('PATCH', f'tournament_rounds?id=eq.{R_FINAL}', {'phase_id': SEMIS, 'group_id': g, 'order_index': 2}, 'Final -> fase Playoffs')
    partido_llave(SF1, g, 'M-SF-1', src('seed', 1), src('seed', 4))   # Jockey Córdoba - Jockey Villa María
    partido_llave(SF2, g, 'M-SF-2', src('seed', 2), src('seed', 3))   # Palermo Bajo - La Tablada
    partido_llave(FIN, g, 'M-F', src('winner', 'M-SF-2'), src('winner', 'M-SF-1'),
                  ('Ganador Semifinal 2', 'Ganador Semifinal 1'), {'phase_id': SEMIS, 'round_uuid': R_FINAL})
    reglas(SEMIS, g, [(SF2, 'winner', FIN, 'home'), (SF1, 'winner', FIN, 'away')])
    escribir('DELETE', f'tournament_phases?id=eq.{FINAL_FASE}', None, 'fase "Final" vacía')

    print('== M19: REC* aparte')
    camp = leer(f'tournament_phases?id=eq.{CAMP}&select=*')[0]
    rondas = [r for r in leer(f'tournament_rounds?phase_id=eq.{CAMP}&select=*') if r['name'].startswith('REC')]
    ids_rondas = [r['id'] for r in rondas]
    respaldo('m19-rec', {'rondas': rondas, 'partidos': leer(f'matches?round_uuid=in.({",".join(ids_rondas)})&select=id,phase_id,round_uuid,round_label')})
    pp = leer(f'tournament_phase_participants?phase_id=eq.{CAMP}&select=*')
    pid_club = {p['id']: p['club_id'] for p in leer(f'tournament_participants?tournament_id=eq.{t}&select=id,club_id')}
    ajeno = 'carlos-paz-rugby-club-m19-a'
    set_ = dict(camp['settings'])
    set_.update({'standings': {'mode': 'automatic', 'editable': True}, 'groupTags': [], 'groupLabels': [], 'teamsCount': 9,
                 'note': 'Fechas REC: tabla aparte, no suman al campeonato.'})
    set_.pop('source', None)
    rec = escribir('POST', 'tournament_phases', {'tournament_id': t, 'season_id': camp['season_id'], 'name': 'REC*',
                                                 'phase_type': 'league', 'order_index': 9, 'is_active': False, 'settings': set_},
                   '"REC*" (liga, tabla propia)')[0]['id']
    filas = [{k: v for k, v in p.items() if k not in ('id', 'created_at', 'updated_at')} | {'phase_id': rec}
             for p in pp if pid_club.get(p['participant_id']) != ajeno]
    escribir('POST', 'tournament_phase_participants', filas, f'{len(filas)} participantes')
    for i, r in enumerate(sorted(rondas, key=lambda r: r['order_index']), 1):
        escribir('PATCH', f'tournament_rounds?id=eq.{r["id"]}', {'phase_id': rec, 'order_index': i}, r['name'])
    escribir('PATCH', f'matches?round_uuid=in.({",".join(ids_rondas)})', {'phase_id': rec}, 'partidos REC -> REC*')

    print('== M19: Campeonato automatico + bandas (1-4 semis, 5-8, 9-10)')
    set_c = dict(camp['settings'])
    set_c['standings'] = {'mode': 'automatic', 'editable': True}
    set_c.pop('source', None)
    escribir('PATCH', f'tournament_phases?id=eq.{CAMP}', {'settings': set_c}, 'standings automatic')
    etiquetas = {l['name']: l['id'] for l in camp['settings']['groupLabels']}
    escribir('DELETE', f'team_labels?phase_id=eq.{CAMP}', None, 'bandas viejas')
    bandas = [('Semifinales', 1, 4), ('Posicionamiento 5° al 8°', 5, 8), ('Posicionamiento 9° y 10°', 9, 10)]
    filas = [{'label_id': etiquetas[n], 'club_id': None, 'tournament_id': t, 'phase_id': CAMP, 'group_id': None, 'position': p}
             for n, d, h in bandas for p in range(d, h + 1)]
    escribir('POST', 'team_labels', filas, f'{len(filas)} puestos')


# ------------------------------------------------------------------------------------------- pre-a
def pre_a():
    SEMIS, R_SEMI = '28ad2f76-d44d-4ff9-944e-9a7da4fadcd7', 'a600c15c-e486-43ec-beaf-57fa2402c9ad'
    SF1, SF2 = '04209f34-12e8-45d1-a8a0-58e43ffa275a', '3d329a6d-fc2b-4781-b79a-5233dbf04532'
    t = tid_de('torneo-cordobes-preintermedia-a')
    print('== Preintermedia A: cuadro (semis + final)')
    molde = leer(f'matches?id=eq.{SF1}&select=*')[0]
    respaldo('pre-a', {'fase': leer(f'tournament_phases?id=eq.{SEMIS}&select=*'), 'ronda': leer(f'tournament_rounds?id=eq.{R_SEMI}&select=*'),
                       'partidos': leer(f'matches?id=in.({SF1},{SF2})&select=*')})
    g = copa(SEMIS)
    renombrar_fase(SEMIS, 'Playoffs')
    escribir('PATCH', f'tournament_rounds?id=eq.{R_SEMI}', {'group_id': g}, 'Semifinales -> copa')
    r_final = ronda_nueva(SEMIS, 'Final', 2, g, molde['season_id'])
    # Tabla sin REC: Tala 1.º, Palermo Bajo 2.º, Jockey Córdoba 3.º, La Tablada 4.ª -> cruces 1.º-3.º y 2.º-4.º
    partido_llave(SF1, g, 'M-SF-1', src('seed', 1), src('seed', 3))   # Tala - Jockey Córdoba (14-17: pasa Jockey Córdoba)
    partido_llave(SF2, g, 'M-SF-2', src('seed', 2), src('seed', 4))   # Palermo Bajo - La Tablada (25-30: pasa La Tablada)
    fin = partido_nuevo(molde, SEMIS, r_final, g, 'M-F', 'jockey-club-cordoba-preintermedia-a', 'la-tablada-a-pre-intermedia',
                        src('winner', 'M-SF-1'), src('winner', 'M-SF-2'), ('Ganador Semifinal 1', 'Ganador Semifinal 2'),
                        '2026-10-24T18:00:00+00:00', 'Fecha y hora provisorias: a confirmar con la Unión Cordobesa.')
    reglas(SEMIS, g, [(SF1, 'winner', fin, 'home'), (SF2, 'winner', fin, 'away')])


# -------------------------------------------------------------------------------------- intermedia
def intermedia():
    SEMIS, FINAL_FASE = 'f1c04ee5-43e3-478e-b92f-642f45dd407c', 'd54dad2a-b65b-4873-94b2-e1383c829857'
    R_SEMI, R_F2, R_F3 = '0bb9131e-63b7-4fe1-9413-832f12682e09', '91aa5b3d-2ade-4435-a132-7e5948d68db4', 'e2afae44-7265-4b4b-841a-ee6c0c0847d4'
    t = tid_de('torneo-cordobes-intermedia')
    print('== Intermedia: cuadro (semis + final + 3.º puesto), se borran los "suspendidos" de relleno')
    todos = leer(f'matches?phase_id=in.({SEMIS},{FINAL_FASE})&select=*')
    reales = [m for m in todos if m['status'] == 'scheduled']
    relleno = [m for m in todos if m['status'] == 'suspended']
    print(f'  reales: {len(reales)} · relleno suspendido: {len(relleno)}')
    if len(reales) != 2 or len(relleno) != 15:
        raise SystemExit('el estado no es el esperado: no se toca nada')
    respaldo('intermedia', {'fases': leer(f'tournament_phases?id=in.({SEMIS},{FINAL_FASE})&select=*'),
                            'rondas': leer(f'tournament_rounds?id=in.({R_SEMI},{R_F2},{R_F3})&select=*'), 'partidos': todos})
    tala = next(m for m in reales if 'tala' in m['home_club_id'])      # Tala - La Tablada (1.º-4.º)
    jcc = next(m for m in reales if m is not tala)                       # Jockey Córdoba - Córdoba Athletic (2.º-3.º)
    escribir('DELETE', f'matches?id=in.({",".join(m["id"] for m in relleno)})', None, f'{len(relleno)} partidos suspendidos')
    escribir('DELETE', f'tournament_rounds?id=in.({R_F2},{R_F3})', None, 'rondas sobrantes')
    escribir('DELETE', f'tournament_phases?id=eq.{FINAL_FASE}', None, 'fase "Final - 3er. / 4to. Puesto" vacía')
    g = copa(SEMIS)
    renombrar_fase(SEMIS, 'Playoffs')
    escribir('PATCH', f'tournament_rounds?id=eq.{R_SEMI}', {'name': 'Semifinales', 'group_id': g}, 'Fecha 1 -> Semifinales')
    season = tala['season_id']
    r_final = ronda_nueva(SEMIS, 'Final', 2, g, season)
    r_3p = ronda_nueva(SEMIS, '3.º y 4.º puesto', 3, g, season)
    partido_llave(tala['id'], g, 'M-SF-1', src('seed', 1), src('seed', 4))
    partido_llave(jcc['id'], g, 'M-SF-2', src('seed', 2), src('seed', 3))
    nota = 'Fecha y hora provisorias: a confirmar con la Unión Cordobesa.'
    fin = partido_nuevo(tala, SEMIS, r_final, g, 'M-F', None, None, src('winner', 'M-SF-1'), src('winner', 'M-SF-2'),
                        ('Ganador Semifinal 1', 'Ganador Semifinal 2'), '2026-10-31T17:00:00+00:00', nota)
    tp = partido_nuevo(tala, SEMIS, r_3p, g, 'M-3P', None, None, src('loser', 'M-SF-1'), src('loser', 'M-SF-2'),
                       ('Perdedor Semifinal 1', 'Perdedor Semifinal 2'), '2026-10-31T15:00:00+00:00', nota)
    reglas(SEMIS, g, [(tala['id'], 'winner', fin, 'home'), (jcc['id'], 'winner', fin, 'away'),
                      (tala['id'], 'loser', tp, 'home'), (jcc['id'], 'loser', tp, 'away')])


# -------------------------------------------------------------------------------------- pre-a-rec
def pre_a_rec():
    """Preintermedia A: la tabla oficial (fully_manual) acumula REC y posicionamiento. Se deja tal cual, rotulada;
    el REC pasa a una fase propia "REC*" (tabla automatica) y se arma "Tabla 18 fechas" (manual, calculada de los
    partidos de las 18 fechas: PJ/PG/PE/PP/PF/PC y bonus defensivo; SIN bonus ofensivo porque no hay tries)."""
    CAMP = '4e2e28f3-fbcc-4fba-b477-81d3f3d433f4'
    t = tid_de('torneo-cordobes-preintermedia-a')
    camp = leer(f'tournament_phases?id=eq.{CAMP}&select=*')[0]
    rondas = [r for r in leer(f'tournament_rounds?phase_id=eq.{CAMP}&select=*') if r['name'].startswith('REC')]
    ids_rondas = [r['id'] for r in rondas]
    partidos = leer(f'matches?phase_id=eq.{CAMP}&select=id,home_club_id,away_club_id,score,round_label,status,round_uuid')
    oficial = leer(f'tournament_standings?phase_id=eq.{CAMP}&select=*')
    pp = leer(f'tournament_phase_participants?phase_id=eq.{CAMP}&select=*')
    print('== Preintermedia A: respaldo')
    respaldo('pre-a-rec', {'fase': camp, 'rondas': rondas, 'partidos_rec': [p for p in partidos if p['round_uuid'] in ids_rondas],
                           'oficial': oficial, 'team_labels': leer(f'team_labels?phase_id=eq.{CAMP}&select=*')})
    quitar = ('id', 'created_at', 'updated_at')

    print('== REC* aparte')
    set_rec = {k: v for k, v in camp['settings'].items() if k not in ('groupLabels', 'groupTags', 'source')}
    set_rec.update({'standings': {'mode': 'automatic', 'editable': True}, 'note': 'Fechas REC: tabla aparte. Suman en la tabla oficial de la Unión, no en las 18 fechas.'})
    rec = escribir('POST', 'tournament_phases', {'tournament_id': t, 'season_id': camp['season_id'], 'name': 'REC*', 'phase_type': 'league',
                                                 'order_index': 9, 'is_active': False, 'settings': set_rec}, '"REC*" (liga, tabla propia)')[0]['id']
    escribir('POST', 'tournament_phase_participants', [{k: v for k, v in p.items() if k not in quitar} | {'phase_id': rec} for p in pp],
             f'{len(pp)} participantes')
    for i, r in enumerate(sorted(rondas, key=lambda r: r['order_index']), 1):
        escribir('PATCH', f'tournament_rounds?id=eq.{r["id"]}', {'phase_id': rec, 'order_index': i}, r['name'])
    escribir('PATCH', f'matches?round_uuid=in.({",".join(ids_rondas)})', {'phase_id': rec}, 'partidos REC -> REC*')

    print('== Tabla oficial: rotulo')
    set_c = dict(camp['settings'])
    set_c['standings'] = {**set_c['standings'], 'source': 'Tabla oficial de la Unión Cordobesa de Rugby (suma las fechas REC y el posicionamiento)'}
    escribir('PATCH', f'tournament_phases?id=eq.{CAMP}', {'name': 'Campeonato (tabla oficial)', 'settings': set_c}, 'rotulo')

    print('== Tabla 18 fechas (manual, calculada)')
    filas = {}
    for p in partidos:
        if p['status'] != 'final' or p['round_label'].startswith('REC'):
            continue
        h, a, s = p['home_club_id'], p['away_club_id'], p['score']
        for c, pf, pc in ((h, s['home'], s['away']), (a, s['away'], s['home'])):
            f = filas.setdefault(c, dict(played=0, won=0, drawn=0, lost=0, scored=0, conceded=0, bonus=0, pts=0))
            f['played'] += 1; f['scored'] += pf; f['conceded'] += pc
            if pf > pc: f['won'] += 1; f['pts'] += 4
            elif pf == pc: f['drawn'] += 1; f['pts'] += 2
            else:
                f['lost'] += 1
                if pc - pf <= 7: f['bonus'] += 1; f['pts'] += 1
    orden = sorted(filas.items(), key=lambda kv: (-kv[1]['pts'], -(kv[1]['scored'] - kv[1]['conceded']), -kv[1]['won']))
    base = {o['club_id']: o for o in oficial}
    for i, (c, f) in enumerate(orden, 1):
        print(f'   {i}. {c:55} PJ{f["played"]} PG{f["won"]} Pts{f["pts"]} (bonus def {f["bonus"]}) dif {f["scored"] - f["conceded"]}')
    set_18 = {k: v for k, v in camp['settings'].items() if k != 'source'}
    set_18.update({'standings': {'mode': 'fully_manual', 'editable': True,
                                 'source': 'Calculada de las 18 fechas (sin REC ni posicionamiento). No incluye bonus ofensivo: los partidos no traen tries.'}})
    p18 = escribir('POST', 'tournament_phases', {'tournament_id': t, 'season_id': camp['season_id'], 'name': 'Tabla 18 fechas', 'phase_type': 'league',
                                                 'order_index': 0, 'is_active': False, 'settings': set_18}, '"Tabla 18 fechas"')[0]['id']
    escribir('POST', 'tournament_phase_participants', [{k: v for k, v in p.items() if k not in quitar} | {'phase_id': p18} for p in pp], f'{len(pp)} participantes')
    out = []
    for i, (c, f) in enumerate(orden, 1):
        o = base[c]
        r = {k: v for k, v in o.items() if k not in ('id', 'last_updated')}
        r.update({'phase_id': p18, 'position': i, 'played': f['played'], 'won': f['won'], 'drawn': f['drawn'], 'lost': f['lost'],
                  'points': f['pts'], 'scored': f['scored'], 'conceded': f['conceded'], 'bonus_points': f['bonus'], 'form': None, 'streak': None})
        out.append(r)
    escribir('POST', 'tournament_standings', out, f'{len(out)} filas')
    etiq = {l['name']: l['id'] for l in camp['settings']['groupLabels']}
    tl = [{'label_id': etiq[n], 'club_id': None, 'tournament_id': t, 'phase_id': p18, 'group_id': None, 'position': p}
          for n, d, h in (('Semifinales', 1, 4), ('Posicionamiento 5to al 8vo', 5, 8)) for p in range(d, h + 1)]
    escribir('PATCH', f'tournament_phases?id=eq.{p18}', {'settings': set_18 | {'groupLabels': camp['settings']['groupLabels'], 'groupTags': camp['settings']['groupTags']}}, 'bandas')
    escribir('POST', 'team_labels', tl, f'{len(tl)} puestos')


if __name__ == '__main__':
    modos = {'m19': m19, 'pre-a': pre_a, 'intermedia': intermedia, 'pre-a-rec': pre_a_rec}
    if len(sys.argv) < 2 or sys.argv[1] not in modos:
        raise SystemExit('uso: python arreglar.py m19|pre-a|intermedia|pre-a-rec [--execute]')
    print('EJECUTANDO' if EJECUTAR else 'PLAN (no escribe)')
    modos[sys.argv[1]]()
    print('listo' if EJECUTAR else 'plan terminado: nada escrito')
