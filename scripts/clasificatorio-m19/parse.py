"""Txt de la BD UAR (Torneo Clasificatorio M19, Mar del Plata) -> lista de tarjetas.
Reusa las funciones de nea-noa-tarjetas/build_neab.py (copiadas: ese archivo corre main() al importarse)."""
import re, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'nea-noa-tarjetas'))
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'nea-noa-tarjetas', 'build_neab.py'), encoding='utf8').read()
src = src.split('\ndef main():')[0]
exec(compile(src, 'build_neab_fn', 'exec'))

TXT = r'C:\Users\srome\Downloads\Torneo  102026 Torneo Clasificatori.txt'
CLUBES = {'LOS 50': 'club-los-50', 'SPORTING': 'ipr-sporting', 'MAR DEL PLATA': 'mar-del-plata-club', 'COMERCIAL': 'comercial-r-c',
          'UNIVERSITARIO': 'universitario-de-mar-del-plata', 'UNION DEL SUR': 'union-del-sur', 'SAN IGNACIO': 'san-ignacio-r-c',
          'LOS CARDOS': 'los-cardos-r-c', 'PUEYRREDON': 'pueyrredon-mar-del-plata', 'BIGUA': 'bigua-rugby-club', 'UNCAS': 'uncas-r-c',
          'MAR DEL PLATA MARRON': 'mar-del-plata-club-marron'}

def tarjetas():
    raw = open(TXT, encoding='utf-8-sig').read().replace(chr(13), '')
    out, vistos = [], set()
    for c in re.split(r'(?m)^(?=Ronda : )', raw):
        if 'Partido número' not in c: continue
        lines = c.split(chr(10))
        for i, l in enumerate(lines):
            if l.startswith('Incidencias PARTIDO'): lines = lines[:i + 1]; break
        ronda = lines[0].split(':', 1)[1].strip()
        fecha_lbl = next((l.split(':', 1)[1].strip() for l in lines if l.startswith('Fecha :')), '')
        num, inc, ros = parse_card(lines)
        if num in vistos: continue
        vistos.add(num)
        hora = next((re.search(r'(\d\d/\d\d/\d{4}) (\d\d:\d\d)', l) for l in lines if l.startswith('Fecha de juego')), None)
        try:
            fecha, ref, nl, nv, pl, pv, estado = cabecera(lines)
        except (AttributeError, IndexError):
            fecha = ref = nl = nv = pl = pv = None; estado = 'sin marcador'
        out.append(dict(num=num, ronda=ronda, fecha_lbl=fecha_lbl, fecha=hora.group(1) if hora else None, hora=hora.group(2) if hora else None,
                        ref=ref, nl=nl, nv=nv, pl=pl, pv=pv, estado=estado, inc=inc, ros=ros, lines=lines))
    return out

if __name__ == '__main__':
    for t in tarjetas():
        print(t['num'], t['ronda'], '|', t['fecha_lbl'], t['fecha'], t['hora'], '|', t['nl'], t['pl'], '-', t['pv'], t['nv'], t['estado'], len(t['ros']['L']), len(t['ros']['V']), len(t['inc']['L']) + len(t['inc']['V']))
