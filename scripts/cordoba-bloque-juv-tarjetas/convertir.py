"""Tarjetas JSON (tablas ya extraidas) del Torneo Bloque Juvenil M16 "A" / M17 "A" -> cards.<m16|m17>.raw.json.

Uso:  python convertir.py "<carpeta con los .json>"
Separa por la division de la tarjeta (M16 / M17) y se queda solo con el torneo BLOQUE JUV. "A"; el resto se
informa y se descarta. Reusa la conversion de scripts/cordoba-m19-tarjetas/convertir.py.
"""
import glob
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'cordoba-m19-tarjetas'))
import convertir  # noqa: E402


def cabecera(path):
    j = json.load(open(path, encoding='utf-8-sig'))
    for pag in j['paginas']:
        for c in pag['contenido']:
            if c.get('tipo') == 'tabla' and (c.get('columnas') or [])[:1] == ['Cancha']:
                f = c['filas'][0]
                return f.get('Torneo') or '', f.get('División') or ''
    return '', ''


def main():
    sin_tipo, grupos, otros = [], {'m16': [], 'm17': []}, {}
    for carpeta in sys.argv[1:]:
        for f in sorted(glob.glob(os.path.join(carpeta, '*.json'))):
            torneo, div = cabecera(f)
            clave = div.lower()
            if 'BLOQUE JUV' in torneo.upper() and '"A"' in torneo and clave in grupos:
                t_ = convertir.tarjeta(f, sin_tipo)
                for lado in ('local', 'visitante'):
                    post = [i for i in t_['inc'][lado] if i['per'] == 'POST']
                    if post:
                        print(f'  POST omitido en {t_["archivo"]} ({lado}): {[i["raw"] for i in post]}')
                    t_['inc'][lado] = [i for i in t_['inc'][lado] if i['per'] != 'POST']
                grupos[clave].append(t_)
            else:
                otros.setdefault(torneo or '(sin torneo)', []).append(os.path.basename(f))
    for clave, tarjetas in grupos.items():
        with open(os.path.join(AQUI, f'cards.{clave}.raw.json'), 'w', encoding='utf8') as fh:
            json.dump(tarjetas, fh, ensure_ascii=False, indent=1)
        print(clave, len(tarjetas), 'tarjetas ·', len({t['numero'] for t in tarjetas}), 'numeros distintos')
        for t in tarjetas:
            if len(t['plantel']) != 2 or any(len(x) != 23 for x in t['plantel']):
                print('plantel raro:', t['archivo'], [len(x) for x in t['plantel']])
            if t['local']['score'] is None:
                print('sin marcador:', t['archivo'])
    for t, fs in sorted(otros.items()):
        print(f'  descartadas ({len(fs)}) torneo {t!r}: {", ".join(fs[:4])}')
    if sin_tipo:
        print('INCIDENCIAS SIN TIPO:', sorted(set(sin_tipo)))


if __name__ == '__main__':
    main()
