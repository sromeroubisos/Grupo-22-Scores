"""JSON de tarjetas (paginas/contenido: campos+texto) -> txt plano que lee build.py (cada tarjeta arranca en 'Torneo : ')."""
import json, sys
j = json.load(open(sys.argv[1], encoding='utf-8-sig'))
out = []
for pag in j['paginas']:
    for c in pag['contenido']:
        if c['tipo'] == 'campos':
            for k, v in c['campos'].items():
                out.append(f'{k} : {v}')
        else:
            out.append(c['texto'])
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(out))
