"""Tarjetas JSON del Torneo Vodacom (Intermedia, Union Cordobesa) -> cards.raw.json.

Uso:  python convertir.py "<carpeta con los .json>"
Reusa la conversion de scripts/cordoba-m19-tarjetas/convertir.py.
"""
import glob
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'cordoba-m19-tarjetas'))
import convertir  # noqa: E402


def main():
    sin_tipo, tarjetas = [], []
    for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.json'))):
        t_ = convertir.tarjeta(f, sin_tipo)
        t_['archivo_cabecera'] = json.load(open(f, encoding='utf-8-sig'))['paginas'][0]['contenido'][1]['filas'][0]
        tarjetas.append(t_)
    with open(os.path.join(AQUI, 'cards.raw.json'), 'w', encoding='utf8') as fh:
        json.dump(tarjetas, fh, ensure_ascii=False, indent=1)
    print(len(tarjetas), 'tarjetas')
    if sin_tipo:
        print('INCIDENCIAS SIN TIPO:', sorted(set(sin_tipo)))


if __name__ == '__main__':
    main()
