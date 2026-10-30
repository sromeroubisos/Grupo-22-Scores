"""cards.raw.json (convertir.py) -> JSON de ficha-partido-local.ts para Copa Cordoba - Torneo Vodacom.

Reusa build.py de interior-tarjetas (cruce con la base por fecha + clubes, eventos validados contra el marcador).
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'interior-tarjetas'))
import build  # noqa: E402

build.AQUI = AQUI
build.SLUGS = ('copa-cordoba-torneo-vodacom',)
build.CLAVES = [
    (('uru',), 'uru'), (('athletic',), 'cac'), (('universitario',), 'cuc'), (('tablada',), 'lta'),
    (('palermo',), 'pb'), (('carlospaz',), 'cprc'), (('sanmartin',), 'smrc'), (('villamaria',), 'jvm'),
    (('jockey', 'cordoba'), 'jcc'), (('tala',), 'tala'),
]
OUT = os.path.join(build.ROOT, 'src', 'scripts', 'formaciones', '2026-10-23-vodacom-tarjetas.json')

sys.argv = [sys.argv[0], '--out', OUT]
build.main()
data = json.load(open(OUT, encoding='utf8'))
data['descripcion'] = 'Copa Córdoba - Torneo Vodacom 2026 (Unión Cordobesa) · tarjetas de partido (JSON de tablas) · validado contra el marcador de la base'
data['torneo'] = 'Copa Córdoba - Torneo Vodacom'
with open(OUT, 'w', encoding='utf8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=1)
