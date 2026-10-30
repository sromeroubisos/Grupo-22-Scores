"""Tarjetas JSON (tablas ya extraidas) de Preintermedia "A" -> cards.raw.json.

Uso:  python convertir_pre_a.py "<carpeta con los .json>"
La carpeta mezcla otros torneos y copias de la misma tarjeta: se queda solo con las tarjetas cuyo
torneo dice PRE-INTER½"A" y deja la deduplicacion por numero de tarjeta a build.py (elige la que cierra).
Reusa la conversion de scripts/cordoba-m19-tarjetas/convertir.py.
"""
import glob
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'cordoba-m19-tarjetas'))
import convertir  # noqa: E402


def torneo_de(path):
    j = json.load(open(path, encoding='utf-8-sig'))
    for pag in j['paginas']:
        for c in pag['contenido']:
            if c.get('tipo') == 'tabla' and (c.get('columnas') or [])[:1] == ['Cancha']:
                return c['filas'][0].get('Torneo') or ''
    return ''


def es_pre_a(torneo):
    t = re.sub(r'[^A-Z0-9]', '', torneo.upper())
    return 'PREINTER' in t and t.split('PREINTER', 1)[1][:1] == 'A'


def main():
    sin_tipo, tarjetas, otros = [], [], {}
    for carpeta in sys.argv[1:]:
        for f in sorted(glob.glob(os.path.join(carpeta, '*.json'))):
            t = torneo_de(f)
            if es_pre_a(t):
                t_ = convertir.tarjeta(f, sin_tipo)
                # periodo POST (cambios anotados despues del pitazo final): no son del partido, build.py no los conoce
                for lado in ('local', 'visitante'):
                    post = [i for i in t_['inc'][lado] if i['per'] == 'POST']
                    if post:
                        print(f'  POST omitido en {t_["archivo"]} ({lado}): {[i["raw"] for i in post]}')
                    t_['inc'][lado] = [i for i in t_['inc'][lado] if i['per'] != 'POST']
                tarjetas.append(t_)
            else:
                otros.setdefault(t or '(sin torneo)', []).append(os.path.basename(f))
    with open(os.path.join(AQUI, 'cards.raw.json'), 'w', encoding='utf8') as fh:
        json.dump(tarjetas, fh, ensure_ascii=False, indent=1)
    print(len(tarjetas), 'tarjetas de Pre A ·', len({t["numero"] for t in tarjetas}), 'numeros distintos')
    for t, fs in sorted(otros.items()):
        print(f'  descartadas ({len(fs)}) torneo {t!r}: {", ".join(fs[:4])}{"…" if len(fs) > 4 else ""}')
    if sin_tipo:
        print('INCIDENCIAS SIN TIPO:', sorted(set(sin_tipo)))
    for t in tarjetas:
        if len(t['plantel']) != 2 or any(len(x) != 23 for x in t['plantel']):
            print('plantel raro:', t['archivo'], [len(x) for x in t['plantel']])
        if t['local']['score'] is None:
            print('sin marcador:', t['archivo'])


if __name__ == '__main__':
    main()
