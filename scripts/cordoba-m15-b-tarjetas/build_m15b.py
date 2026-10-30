"""cards.m15b.raw.json (convertir_txt.py) -> JSON de ficha-partido-local.ts para el Torneo Cordobes M15 "B".

Uso:  python build_m16b.py
Reusa build.py de interior-tarjetas. En este torneo La Tablada y Tala tienen un "B" y un "C" como clubes
distintos: la clave lleva la letra, si no los dos se cruzan con cualquiera de sus partidos.
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
import build  # noqa: E402

build.AQUI = AQUI
build.SLUGS = ('torneo-cordobes-m15-b',)
BASES = [  # el orden importa: "universitario" y "jockey" no pueden caer en "cordoba r.c."
    (('aero',), 'aero'), (('altagracia',), 'altagracia'), (('baguales',), 'baguales'),
    (('athletic',), 'cac'), (('jockey',), 'jcc'), (('universitario',), 'cuc'), (('tablada',), 'lta'),
    (('palermo',), 'pb'), (('cuervos',), 'cuervos'), (('sanfrancisco',), 'sf'), (('tala',), 'tala'), (('urucure',), 'urucure'),
]


def clave(nombre):
    n = build.norm(nombre)
    for palabras, k in BASES:
        if all(p in n for p in palabras):
            if k in ('lta', 'tala', 'jcc'):
                m = re.search(r'"([ABC])"\s*$', nombre.strip())
                return k + (m[1].lower() if m else '')
            return k
    if 'cordoba' in n:
        return 'crc'
    return n


build.clave = clave
build.MIN_PLANTEL = int(os.environ.get('MIN_PLANTEL', 15))
OUT = os.path.join(build.ROOT, 'src', 'scripts', 'formaciones', os.environ.get('OUT_NAME', '2026-10-30-m15-b-tarjetas.json'))


def main():
    os.replace(os.path.join(AQUI, 'cards.m15b.raw.json'), os.path.join(AQUI, 'cards.raw.json'))
    try:
        sys.argv = [sys.argv[0], '--out', OUT]
        build.main()
    finally:
        os.replace(os.path.join(AQUI, 'cards.raw.json'), os.path.join(AQUI, 'cards.m15b.raw.json'))
        for n, d in (('informe.txt', 'informe.m15b.txt'), ('db_matches.json', 'db_matches.m15b.json')):
            if os.path.exists(os.path.join(AQUI, n)):
                os.replace(os.path.join(AQUI, n), os.path.join(AQUI, d))
    data = json.load(open(OUT, encoding='utf8'))
    data['descripcion'] = 'Torneo Cordobés M15 "B" 2026 (Unión Cordobesa) · tarjetas de partido (texto del SIGER) · validado contra el marcador de la base'
    data['torneo'] = 'Torneo Cordobés M15 "B"'
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
