"""cards.raw.json (convertir.py) -> JSON de ficha-partido-local.ts para el Torneo Cordobes M19 "A".

Uso:  python build_m19.py
Reusa build.py de interior-tarjetas (cruce con la base por fecha + clubes, armado de eventos, validacion
contra el marcador, fichas existentes por nombre); solo cambia el torneo y las claves de club.
Escribe informe.txt y db_matches.json acá y el JSON en src/scripts/formaciones/.
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
import build  # noqa: E402

build.AQUI = AQUI
build.SLUGS = ('torneo-cordobes-m19-a',)
# Clave por palabras de la forma normalizada. El orden importa: "universitario de cordoba" contiene
# "cordoba", asi que las específicas van antes que "jockey club cordoba".
build.CLAVES = [
    (('urucure',), 'uru'), (('athletic',), 'cac'), (('universitario',), 'cuc'), (('tablada',), 'lta'),
    (('palermo',), 'pb'), (('carlospaz',), 'cprc'), (('jockey', 'villamaria'), 'jvm'),
    (('jockey', 'cordoba'), 'jcc'), (('sanmartin',), 'smrc'), (('tala',), 'tala'),
]

OUT = os.path.join(build.ROOT, 'src', 'scripts', 'formaciones', '2026-10-21-m19-a-tarjetas.json')


def main():
    sys.argv = [sys.argv[0], '--out', OUT]
    build.main()
    data = json.load(open(OUT, encoding='utf8'))
    data['descripcion'] = ('Torneo Menores de 19 "A" 2026 (Unión Cordobesa) · tarjetas de partido (JSON de tablas) · '
                           'validado contra el marcador de la base')
    data['torneo'] = 'Torneo Cordobés M19 "A"'
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
