"""JSON de tarjetas UAR (bloques campos/texto) -> txt con el formato que lee trp-tarjetas/build.py.
Las claves traen el pie de pagina pegado ('© 2026. UARTorneo'): se normalizan por sufijo."""
import json, sys, collections
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf8'))


def norm(k):
    if k.endswith('orneo'): return 'Torneo'
    return k


out, en_tarjeta, torneo, n = [], False, '', collections.Counter()
for pg in d['paginas']:
    for b in pg['contenido']:
        if b['tipo'] == 'campos':
            c = {norm(k): v for k, v in b['campos'].items()}
            pn = next((k for k in c if k.startswith('Partido n')), None)
            if 'Torneo' in c: torneo = c['Torneo']
            if pn or 'Torneo' in c:
                en_tarjeta = bool(pn)
                if pn:
                    n[torneo, c.get('Ronda')] += 1
                    out.append(f'Torneo : {torneo}')
                    out += [f'{"Partido número" if k == pn else k} : {v}' for k, v in c.items() if k != 'Torneo']
                continue
            if en_tarjeta: out += [f'{k} : {v}' for k, v in c.items()]
        elif en_tarjeta:
            out.append(b['texto'])
open(dst, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
for k, v in n.items(): print(v, k)
