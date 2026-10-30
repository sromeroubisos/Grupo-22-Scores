"""cards.<m16|m17>.raw.json (convertir.py) -> JSON de ficha-partido-local.ts para el Torneo Cordobes M16 "A" / M17 "A".

Uso:  python build_bloque.py m16|m17
Reusa build.py de interior-tarjetas (cruce con la base por fecha + clubes, eventos validados contra el marcador).
Escribe informe.<k>.txt y db_matches.<k>.json aca y el JSON en src/scripts/formaciones/.
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
import build  # noqa: E402

K = sys.argv[1] if len(sys.argv) > 1 else 'm16'
build.AQUI = AQUI
build.SLUGS = (f'torneo-cordobes-{K}-a',)
# El orden importa: "universitario" y "jockey" aparecen en varios nombres.
build.CLAVES = [
    (('uru',), 'uru'), (('athletic',), 'cac'), (('universitario',), 'cuc'), (('tablada',), 'lta'),
    (('palermo',), 'pb'), (('carlospaz',), 'cprc'), (('sanmartin',), 'smrc'), (('villamaria',), 'jvm'),
    (('jockey', 'cordoba'), 'jcc'), (('tala',), 'tala'),
]
OUT = os.path.join(build.ROOT, 'src', 'scripts', 'formaciones', f'2026-10-22-{K}-a-tarjetas.json')


def main():
    os.replace(os.path.join(AQUI, f'cards.{K}.raw.json'), os.path.join(AQUI, 'cards.raw.json'))
    try:
        sys.argv = [sys.argv[0], '--out', OUT]
        build.main()
    finally:
        os.replace(os.path.join(AQUI, 'cards.raw.json'), os.path.join(AQUI, f'cards.{K}.raw.json'))
        for n, d in (('informe.txt', f'informe.{K}.txt'), ('db_matches.json', f'db_matches.{K}.json')):
            if os.path.exists(os.path.join(AQUI, n)):
                os.replace(os.path.join(AQUI, n), os.path.join(AQUI, d))
    data = json.load(open(OUT, encoding='utf8'))
    data['descripcion'] = (f'Torneo Cordobés {K.upper()} "A" 2026 (Unión Cordobesa) · tarjetas de partido (JSON de tablas) · '
                           'validado contra el marcador de la base')
    data['torneo'] = f'Torneo Cordobés {K.upper()} "A"'
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
