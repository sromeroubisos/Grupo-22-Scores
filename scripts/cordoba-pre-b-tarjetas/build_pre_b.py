"""cards.raw.json (convertir_pre_b.py) -> JSON de ficha-partido-local.ts para el Torneo Cordobes Preintermedia "B".

Uso:  python build_pre_b.py
Reusa build.py de interior-tarjetas. A diferencia de la Pre A, aca un mismo club juega con varias divisiones
(Universidad Nacional A/B, Cordoba Athletic B/C, Jockey Club Cordoba B/C): la clave lleva la letra de la division.
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
import build  # noqa: E402

build.AQUI = AQUI
build.SLUGS = ('torneo-cordobes-preintermedia-b',)

BASES = [  # palabras en la forma normalizada -> clave base; el orden importa
    (('univnac',), 'unc'), (('universidadnacional',), 'unc'), (('universitario',), 'cuc'),
    (('athletic',), 'cac'), (('jockey', 'cordoba'), 'jcc'), (('tala',), 'tala'), (('palermo',), 'pb'),
    (('tablada',), 'lta'), (('taborin',), 'tab'), (('hurones',), 'hur'), (('carlospaz',), 'cprc'),
    (('baguales',), 'bag'),
]


def clave(nombre):
    n = build.norm(nombre).replace('preintermedia', '').replace('pre', '', 0)
    # "La Tablada "B" - Pre Intermedia" -> queda "latabladab" + "intermedia"
    n = n.replace('intermedia', '')
    for palabras, k in BASES:
        if all(p in n for p in palabras):
            letra = n[-1] if n[-1] in 'abc' and k not in ('tab', 'hur', 'cprc', 'bag') else ''
            return k + letra
    return n


build.clave = clave

OUT = os.path.join(build.ROOT, 'src', 'scripts', 'formaciones', '2026-10-22-pre-b-tarjetas.json')


def main():
    sys.argv = [sys.argv[0], '--out', OUT]
    build.main()
    data = json.load(open(OUT, encoding='utf8'))
    data['descripcion'] = ('Torneo Cordobés Preintermedia "B" 2026 (Unión Cordobesa) · tarjetas de partido (JSON de tablas) · '
                           'validado contra el marcador de la base')
    data['torneo'] = 'Torneo Cordobés Preintermedia "B"'
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
