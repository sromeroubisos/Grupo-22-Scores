# -*- coding: utf-8 -*-
"""Scraper de torneos de la Confederación Argentina de Hockey (cahockey.org.ar).

Usa Scrapling (https://github.com/D4Vinci/Scrapling) para cosechar:

  - torneos-lnh                  -> out/lnh.json
  - torneo-argentino-de-clubes   -> out/argentino-clubes.json
  - argentino-de-selecciones     -> out/argentino-selecciones.json
  - torneos-internacionales      -> out/internacionales.json

Con --sicah baja además el detalle de cada torneo desde SICAH
(sicah.cahockey.org.ar): posiciones por zona, partidos (día, hora, cancha,
resultado) y planteles. Un archivo por torneo en out/sicah/<id>.json.

Cómo funciona el sitio (relevado a mano):
  - El listado por años vive en .col-small como acordeón:
    .btn-acordeon-fecha = año, ul.circular2 > li = torneo, con
    a.ampliar_torneo[id] y el texto "Desde el DD/MM/YYYY al DD/MM/YYYY".
  - El detalle se pide con POST /updateTorneo (id=<n>) y trae el PDF del
    fixture y un iframe a SICAH ?pub=consultatorneo&torneo=<nombre>.
  - SICAH devuelve una página iso-8859-1 con tablas de posiciones por zona
    y modales basic-modal-content<NN> con el detalle de cada partido.

Uso:
  python scripts/cahockey/scrape_cahockey.py                # metadatos de las 4 secciones
  python scripts/cahockey/scrape_cahockey.py lnh --sicah    # una sección + detalle SICAH
  python scripts/cahockey/scrape_cahockey.py --sicah --delay 1
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

from scrapling import Selector
from scrapling.fetchers import Fetcher

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://www.cahockey.org.ar/"
OUT_DIR = Path(__file__).parent / "out"

SECCIONES = {
    "lnh": "torneos-lnh",
    "argentino-clubes": "torneo-argentino-de-clubes",
    "argentino-selecciones": "argentino-de-selecciones",
    "internacionales": "torneos-internacionales",
}

DIAS = ("Lunes", "Martes", "Miércoles", "Miercoles", "Jueves", "Viernes", "Sábado", "Sabado", "Domingo")

RE_RANGO = re.compile(r"Desde el (\d{2}/\d{2}/\d{4})\s*(?:al|hasta el)\s*(\d{2}/\d{2}/\d{4})")


def fecha_iso(ddmmyyyy: str) -> str:
    d, m, y = ddmmyyyy.split("/")
    return f"{y}-{m}-{d}"


def limpiar(texto: str) -> str:
    return re.sub(r"\s+", " ", unescape(texto)).strip()


def get(url: str):
    return Fetcher.get(url, stealthy_headers=True)


# ---------------------------------------------------------------- listados


def parsear_listado(page) -> list[dict]:
    """Extrae los torneos del acordeón por años de .col-small."""
    torneos = []
    col = page.css(".col-small")
    if not col:
        return torneos
    anio = None
    # los btn-acordeon-fecha (año) y content-acordeon-fecha (ul) alternan
    for div in col[0].css("div"):
        clases = div.attrib.get("class", "")
        if "btn-acordeon-fecha" in clases:
            texto = limpiar(div.get_all_text(strip=True))
            anio = int(texto) if texto.isdigit() else None
            continue
        if "content-acordeon-fecha" not in clases:
            continue
        for li in div.css("li"):
            a = li.css("a.ampliar_torneo")
            if not a:
                continue
            texto_li = li.get_all_text(strip=True)
            rango = RE_RANGO.search(texto_li.replace("\n", " "))
            desde = fecha_iso(rango.group(1)) if rango else None
            hasta = fecha_iso(rango.group(2)) if rango else None
            descripcion = ""
            if rango:
                resto = texto_li.replace("\n", " ")[rango.end():]
                descripcion = limpiar(resto)
            torneos.append(
                {
                    "id": a[0].attrib.get("id"),
                    "anio": anio,
                    "titulo": limpiar(a[0].get_all_text(strip=True)),
                    "desde": desde,
                    "hasta": hasta,
                    "descripcion": descripcion,
                }
            )
    return torneos


def detalle_torneo(torneo_id: str) -> dict:
    """POST /updateTorneo: devuelve fixture PDF y URL del iframe de SICAH."""
    page = Fetcher.post(
        urljoin(BASE, "updateTorneo"),
        data={"id": torneo_id},
        headers={"X-Requested-With": "XMLHttpRequest", "Referer": urljoin(BASE, "torneos-lnh")},
        stealthy_headers=True,
    )
    detalle: dict = {"fixture_pdf": None, "sicah_url": None, "sicah_torneo": None}
    for a in page.css("a"):
        href = a.attrib.get("href", "")
        if "/media/torneos/" in href and href.lower().endswith(".pdf"):
            detalle["fixture_pdf"] = href
    for iframe in page.css("iframe"):
        src = iframe.attrib.get("src", "")
        if "sicah" in src:
            detalle["sicah_url"] = src
            qs = parse_qs(urlparse(src).query)
            nombres = qs.get("torneo") or []
            detalle["sicah_torneo"] = limpiar(nombres[0]) if nombres else None
    return detalle


# ---------------------------------------------------------------- SICAH


def parsear_sicah(html: str) -> dict:
    """Posiciones por zona, partidos y planteles de una página consultatorneo."""
    sel = Selector(html)
    datos: dict = {"nombre": None, "desde": None, "hasta": None, "director": None, "posiciones": [], "partidos": []}

    m = re.search(r"Torneo ([^<]+)<br><span class=\"titulo_3\">Desde el (\d{2}/\d{2}/\d{4}) hasta el (\d{2}/\d{2}/\d{4})", html)
    if m:
        datos["nombre"] = limpiar(m.group(1))
        datos["desde"] = fecha_iso(m.group(2))
        datos["hasta"] = fecha_iso(m.group(3))
    m = re.search(r"Director del Torneo:\s*([^<]+)<", html)
    if m:
        datos["director"] = limpiar(m.group(1))

    # ---- posiciones: cada bloque arranca con un titulotabla "ZONA X"
    # seguido de cabecera Equipo/Pts/J/G/E/P/GF/GC/Dif y filas class=texto
    zona_actual = None
    equipos: list[dict] = []
    for tr in sel.css("tr"):
        celdas = tr.css("td")
        if not celdas:
            continue
        primera = limpiar(celdas[0].get_all_text(strip=True))
        clase = celdas[0].attrib.get("class", "")
        if clase == "titulotabla" and primera.upper().startswith("ZONA"):
            if zona_actual and equipos:
                datos["posiciones"].append({"zona": zona_actual, "equipos": equipos})
            zona_actual, equipos = primera, []
            continue
        if zona_actual is None or clase != "texto":
            continue
        textos = [limpiar(c.get_all_text(strip=True)) for c in celdas]
        # fila de equipo: celda vacía + nombre + 8 números (o '-')
        if len(textos) >= 10 and textos[1] and not textos[1].isdigit():
            def num(v: str) -> int:
                return int(v) if v != "-" and v.lstrip("-").isdigit() else 0
            equipos.append(
                {
                    "equipo": textos[1],
                    "pts": num(textos[2]),
                    "j": num(textos[3]),
                    "g": num(textos[4]),
                    "e": num(textos[5]),
                    "p": num(textos[6]),
                    "gf": num(textos[7]),
                    "gc": num(textos[8]),
                    "dif": num(textos[9]),
                }
            )
    if zona_actual and equipos:
        datos["posiciones"].append({"zona": zona_actual, "equipos": equipos})

    # ---- día de la semana por partido: el titulotabla con el día precede
    # a los modales basic-modal-content<NN> de esa jornada
    dias_pos = [
        (m.start(), m.group(1))
        for m in re.finditer(r'class="titulotabla">(%s)</td>' % "|".join(DIAS), html)
    ]

    def dia_de(pos: int) -> str | None:
        actual = None
        for p, d in dias_pos:
            if p < pos:
                actual = d
            else:
                break
        return actual

    # ---- partidos: modales con el detalle completo
    for modal in sel.css("div[id^='basic-modal-content']"):
        pos = html.find('id="%s"' % modal.attrib.get("id", ""))
        h2 = modal.css("h2")
        encabezado = limpiar(h2[0].get_all_text(strip=True)) if h2 else ""
        m_nro = re.search(r"Partido\s+(\d+)", encabezado)
        m_zona = re.search(r"\|\s*(Zona [^|]+?)\s*(?:\||$)", encabezado)
        m_hora = re.search(r"(\d{1,2}:\d{2})\s*hs", encabezado)
        m_cancha = re.search(r"Cancha\s*(.+)$", encabezado)
        partido: dict = {
            "nro": m_nro.group(1) if m_nro else None,
            "zona": limpiar(m_zona.group(1)) if m_zona else None,
            "dia": dia_de(pos) if pos >= 0 else None,
            "hora": m_hora.group(1) if m_hora else None,
            "cancha": limpiar(m_cancha.group(1)) if m_cancha else None,
            "local": None,
            "visitante": None,
        }
        # los dos h3 traen "EQUIPO   goles"
        lados = []
        for h3 in modal.css("h3"):
            texto = limpiar(h3.get_all_text(strip=True))
            # "LOS TORDOS 5" y también "G. Y ESGRIMA 6 (4)": el paréntesis es la
            # definición por penales. Sin contemplarlo, el marcador se queda
            # pegado al nombre y nace un club llamado "Jockey Club 2 (3)".
            m_eq = re.match(r"(.+?)\s+(\d+)(?:\s*\((\d+)\))?$", texto)
            if m_eq:
                lados.append({
                    "equipo": limpiar(m_eq.group(1)),
                    "goles": int(m_eq.group(2)),
                    "penales": int(m_eq.group(3)) if m_eq.group(3) else None,
                    "plantel": [],
                })
            elif texto:
                # Un partido sin jugar trae un guión donde va el marcador, y sin
                # sacarlo el nombre del equipo queda "Federación Cordobesa -".
                nombre = re.sub(r"\s*[-–—]\s*$", "", texto).strip()
                if nombre:
                    lados.append({"equipo": nombre, "goles": None, "penales": None, "plantel": []})
        # planteles: tablas class=blanco, una por equipo, filas "N - APELLIDO, NOMBRE"
        planteles = []
        for tabla in modal.css("table.blanco"):
            jugadores = [
                limpiar(fila.get_all_text(strip=True))
                for fila in tabla.css("tr")
                if limpiar(fila.get_all_text(strip=True))
            ]
            if jugadores:
                planteles.append(jugadores)
        for i, lado in enumerate(lados[:2]):
            if i < len(planteles):
                lado["plantel"] = planteles[i]
        if lados:
            partido["local"] = lados[0]
            partido["visitante"] = lados[1] if len(lados) > 1 else None
        datos["partidos"].append(partido)

    return datos


def bajar_sicah(url: str) -> dict:
    page = get(url)
    cuerpo = page.body
    html = cuerpo.decode("iso-8859-1", errors="replace") if isinstance(cuerpo, bytes) else cuerpo
    return parsear_sicah(html)


# ---------------------------------------------------------------- internacionales


def parsear_ficha(page) -> dict | None:
    """Ficha de torneo con pestañas (#tabs_wrapper).

    Aparece cuando el historial tiene una sola edición, y también en las URLs
    de edición `/<id>/<n>`. El contenido es WYSIWYG —párrafos sueltos, listas y
    tablas pegadas de Word—, así que se guarda el texto de cada pestaña más las
    filas de las tablas que traiga. Forzar un esquema acá miente en la mitad de
    los casos: la misma pestaña "posiciones" es un `<div>` por puesto en un
    torneo y una `MsoNormalTable` en el siguiente.
    """
    if not page.css("#tabs_wrapper"):
        return None
    # los nombres salen de la propia solapa; los ids son tab1..tab7 y 'fixture'
    nombres: dict[str, str] = {}
    for a in page.css("#solapa a"):
        href = (a.attrib.get("href") or "").lstrip("#")
        if href:
            nombres[href] = limpiar(a.get_all_text(strip=True))

    ficha: dict = {"titulo": None, "fechas": None, "pestanas": []}
    tab1 = page.css("#tab1")
    if tab1:
        titulos = tab1[0].css("h4")
        if titulos:
            ficha["titulo"] = limpiar(titulos[0].get_all_text(strip=True))
        fechas = tab1[0].css("p.fechaN")
        if fechas:
            ficha["fechas"] = limpiar(fechas[0].get_all_text(strip=True))

    for contenido in page.css(".tab_content"):
        tab_id = contenido.attrib.get("id") or ""
        texto = limpiar(contenido.get_all_text(strip=True))
        pdfs = [
            a.attrib.get("href")
            for a in contenido.css("a")
            if (a.attrib.get("href") or "").lower().endswith(".pdf")
        ]
        filas = []
        for tabla in contenido.css("table"):
            for tr in tabla.css("tr"):
                celdas = [limpiar(td.get_all_text(strip=True)) for td in tr.css("td")]
                if any(celdas):
                    filas.append(celdas)
        if not (texto or pdfs or filas):
            continue  # pestaña vacía: el sitio las deja declaradas sin contenido
        ficha["pestanas"].append(
            {
                "id": tab_id,
                "nombre": nombres.get(tab_id),
                "texto": texto,
                "pdfs": pdfs,
                "filas": filas,
            }
        )
    return ficha


def cosechar_internacionales(delay: float) -> dict:
    page = get(urljoin(BASE, "torneos-internacionales"))
    indice = []
    vistos = set()
    for a in page.css("a"):
        href = a.attrib.get("href", "")
        m = re.search(r"historial-torneo-(femenino|masculino)/([^/]+)/(\d+)", href)
        if not m or href in vistos:
            continue
        vistos.add(href)
        indice.append({"rama": m.group(1), "torneo": m.group(2), "id": m.group(3), "url": href})

    torneos = []
    for entrada in indice:
        print(f"  historial {entrada['rama']}/{entrada['torneo']}...", flush=True)
        pagina = get(entrada["url"])
        ediciones = []
        for box in pagina.css(".box-ss"):
            enlaces = box.css("a")
            titulo = limpiar(enlaces[0].get_all_text(strip=True)) if enlaces else None
            link = enlaces[0].attrib.get("href") if enlaces else None
            texto = box.get_all_text(strip=True)
            lineas = [limpiar(l) for l in texto.splitlines() if limpiar(l)]
            fecha = next((l for l in lineas if re.fullmatch(r"\d{2}/\d{2}/\d{4}", l)), None)
            lugar = None
            if fecha and fecha in lineas:
                resto = lineas[lineas.index(fecha) + 1:]
                lugar = resto[0] if resto else None
            edicion = {"titulo": titulo, "fecha": fecha, "lugar": lugar, "link": link}
            # casi todas las ediciones linkean a fih.ch; las pocas que se quedan
            # en el sitio tienen ficha propia con planteles, posiciones y crónicas
            if link and "cahockey.org.ar" in link:
                time.sleep(delay)
                try:
                    edicion["ficha"] = parsear_ficha(get(link))
                except Exception as e:  # noqa: BLE001 - cosecha: anotar y seguir
                    edicion["error_ficha"] = str(e)
            ediciones.append(edicion)
        torneo = {**entrada, "ediciones": ediciones}
        # sin .box-ss no está vacío: el historial de una sola edición muestra
        # directamente la ficha del torneo en lugar del índice
        if not ediciones:
            torneo["ficha"] = parsear_ficha(pagina)
        torneos.append(torneo)
        time.sleep(delay)
    return {"seccion": "internacionales", "torneos": torneos}


# ---------------------------------------------------------------- main


def cosechar_seccion(clave: str, con_sicah: bool, delay: float, anio: int | None = None) -> dict:
    page = get(urljoin(BASE, SECCIONES[clave]))
    torneos = parsear_listado(page)
    if anio is not None:
        torneos = [t for t in torneos if t["anio"] == anio]
    print(f"  {len(torneos)} torneos en el listado{f' (solo {anio})' if anio else ''}", flush=True)
    for t in torneos:
        time.sleep(delay)
        try:
            t.update(detalle_torneo(t["id"]))
        except Exception as e:  # noqa: BLE001 - cosecha: anotar y seguir
            t["error_detalle"] = str(e)
            continue
        print(f"    [{t['anio']}] {t['titulo']} -> sicah={'sí' if t['sicah_url'] else 'no'}", flush=True)
        if con_sicah and t.get("sicah_url"):
            time.sleep(delay)
            try:
                detalle = bajar_sicah(t["sicah_url"])
                destino = OUT_DIR / "sicah" / f"{t['id']}.json"
                destino.parent.mkdir(parents=True, exist_ok=True)
                destino.write_text(json.dumps(detalle, ensure_ascii=False, indent=2), encoding="utf-8")
                t["sicah_archivo"] = f"sicah/{t['id']}.json"
                t["sicah_partidos"] = len(detalle["partidos"])
                t["sicah_zonas"] = len(detalle["posiciones"])
            except Exception as e:  # noqa: BLE001
                t["error_sicah"] = str(e)
    return {"seccion": clave, "torneos": torneos}


def main() -> None:
    parser = argparse.ArgumentParser(description="Scraper de torneos de cahockey.org.ar")
    parser.add_argument("secciones", nargs="*", choices=list(SECCIONES.keys()), help="secciones a cosechar (default: todas)")
    parser.add_argument("--sicah", action="store_true", help="bajar también el detalle SICAH de cada torneo")
    parser.add_argument("--delay", type=float, default=0.5, help="pausa entre requests en segundos")
    parser.add_argument("--anio", type=int, help="cosechar solo ese año (no aplica a internacionales)")
    parser.add_argument("--fusionar", action="store_true",
                        help="con --anio: conserva del archivo anterior los torneos de los otros años")
    args = parser.parse_args()

    claves = args.secciones or list(SECCIONES.keys())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for clave in claves:
        print(f"== {clave} ==", flush=True)
        if clave == "internacionales":
            datos = cosechar_internacionales(args.delay)
        else:
            datos = cosechar_seccion(clave, args.sicah, args.delay, args.anio)
        destino = OUT_DIR / f"{clave}.json"

        # Re-cosechar un año suelto no puede tirar los demás: se reemplazan sólo
        # los de ese año y el resto del archivo queda como estaba.
        if args.fusionar and args.anio is not None and destino.exists():
            previos = json.loads(destino.read_text(encoding="utf-8")).get("torneos", [])
            conservados = [t for t in previos if t.get("anio") != args.anio]
            datos["torneos"] = datos["torneos"] + conservados
            print(f"  fusionado con {len(conservados)} torneos de otros años", flush=True)

        destino.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  -> {destino} ({len(datos['torneos'])} torneos)", flush=True)


if __name__ == "__main__":
    main()
