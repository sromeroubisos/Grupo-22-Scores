"""Tarjetas JSON (tablas ya extraidas) del Torneo Menores de 19 "A" -> cards.raw.json.

Uso:  python convertir.py "<carpeta con los .json>"
Misma forma que escribe scripts/interior-tarjetas/parse.py, asi build.py las consume igual.
Cada archivo es una tarjeta con N paginas: 'Pos' (23+23), 'Incidencias equipo LOCAL/VISITANTE'
(se juntan entre paginas) y 'campos' (arbitro). Lo que no cierra lo valida build.py contra el marcador.
"""
import glob
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
from parse import limpiar_nombre, tipo_incidencia  # noqa: E402


def entero(s):
    s = (s or '').strip()
    return int(s) if s.isdigit() else None


def jugador(f):
    """El nombre largo se desborda sobre la columna del DNI: 'Ignacio47838079' es 'Ignacio' + DNI."""
    nombre, doc = (f.get('Apellido y Nombre') or '').strip(), (f.get('N° Doc.') or '').strip()
    m = re.fullmatch(r'(\D*?)\s*(\d*)', doc)
    if m and m[1]:
        nombre = f'{nombre} {m[1]}'.strip()
        doc = m[2]
    return {'pos': entero(f.get('Pos')), 'dor': entero(f.get('Dor')), 'nombre': nombre, 'doc': doc}


def incidencia(f, sin_tipo):
    texto = (f.get('Incid.') or '').strip()
    tipo = tipo_incidencia(texto)
    if not tipo:
        sin_tipo.append(texto)
        return None
    ptos, dor = entero(f.get('Ptos.')), entero(f.get('Dorsal'))
    if tipo in ('try', 'penalty_try', 'conversion', 'penalty_goal', 'drop_goal'):
        nums = [n for n in (ptos, dor) if n is not None]
    else:
        nums = [dor] if dor is not None else []
    per = (f.get('Tie.') or '').strip().upper()
    minuto = entero(f.get('Min.'))
    return {'per': per, 'min': minuto, 'minRaw': (f.get('Min.') or '').strip(), 'tipo': tipo, 'nums': nums,
            'obs': (f.get('Observaciones') or '').strip(),
            'raw': f'{per} {f.get("Min.")} {texto} {f.get("Ptos.")} {f.get("Dorsal")}'}


def tarjeta(path, sin_tipo):
    j = json.load(open(path, encoding='utf-8-sig'))
    card = {'archivo': j['archivo'], 'numero': None, 'fecha': None, 'hora': None, 'instancia': None,
            'cancha': None, 'local': {'nombre': None, 'score': None}, 'visitante': {'nombre': None, 'score': None},
            'arbitro': None, 'plantel': [], 'inc': {'local': [], 'visitante': []}}
    for pag in j['paginas']:
        for c in pag['contenido']:
            tipo, cols = c.get('tipo'), c.get('columnas') or []
            if tipo == 'texto':
                m = re.search(r'Tarjeta de partido N\S*:?\s*(\d+)', c['texto'])
                if m:
                    card['numero'] = m[1]
                m = re.fullmatch(r'(.+?)\s+(\d+)\s+(.+?)\s+(\d+)', c['texto'].strip())
                if m and not card['local']['nombre'] and 'Tarjeta' not in c['texto']:
                    card['local'] = {'nombre': m[1], 'score': int(m[2])}
                    card['visitante'] = {'nombre': m[3], 'score': int(m[4])}
            elif tipo == 'campos':
                ref = (c['campos'].get('Referee') or '').strip()
                if ref:
                    card['arbitro'] = limpiar_nombre(ref)
            elif tipo == 'tabla' and cols[:1] == ['Cancha']:
                f = c['filas'][0]
                card['fecha'], card['hora'] = f['Día'], f['Hora']
                card['cancha'], card['instancia'] = f['Cancha'], f.get('Instancia') or f.get('Fecha')
            elif tipo == 'tabla' and cols[:1] == ['Pos']:
                card['plantel'].append([jugador(f) for f in c['filas'] if (f.get('Apellido y Nombre') or '').strip()])
            elif tipo == 'tabla' and (c.get('titulo') or '').startswith('Incidencias equipo'):
                lado = 'local' if 'LOCAL' in c['titulo'].upper() else 'visitante'
                for f in c['filas']:
                    r = incidencia(f, sin_tipo)
                    if r:
                        card['inc'][lado].append(r)
    return card


def main():
    sin_tipo, tarjetas = [], []
    for carpeta in sys.argv[1:]:
        for f in sorted(glob.glob(os.path.join(carpeta, '*.json'))):
            tarjetas.append(tarjeta(f, sin_tipo))
    with open(os.path.join(AQUI, 'cards.raw.json'), 'w', encoding='utf8') as fh:
        json.dump(tarjetas, fh, ensure_ascii=False, indent=1)
    print(len(tarjetas), 'tarjetas')
    if sin_tipo:
        print('INCIDENCIAS SIN TIPO:', sorted(set(sin_tipo)))
    for t in tarjetas:
        if len(t['plantel']) != 2 or any(len(x) != 23 for x in t['plantel']):
            print('plantel raro:', t['archivo'], [len(x) for x in t['plantel']])
        if t['local']['score'] is None:
            print('sin marcador:', t['archivo'])


if __name__ == '__main__':
    main()
