# -*- coding: utf-8 -*-
"""Scraper de torneos de la Asociación Tucumana Amateur de Hockey (atahockey.com).

Usa Scrapling (https://github.com/D4Vinci/Scrapling). Las páginas WordPress
/torneo-masculino y /torneo-femenino solo traen un div vacío que se llena por
AJAX desde /stats/stats.php (datos del sistema GDI de marnetweb). Este script
va directo al endpoint:

  stats.php?EquipoId=<división>&NivId=1&FixId=<torneo>&FixSexo=M|F
    - #combo_equipos: todas las combinaciones torneo × división disponibles
    - .tablaPos: posiciones (# Equipo PJ PG PE PP TF TC TD Pts)
    - #table_play_off: llaves (instancia + cruces con resultado y fecha)
    - tablaHead "… Rueda | RESULTADOS | FECHA N" + .tablaRes: resultados de la
      fecha N; se pagina con &ultimaFecha=N
    - tablaHead "GOLEADORES" + .tablaRes: goleadores
    - link "Descargar Fixture" al PDF en marnetweb.com.ar

Salida: out/masculino.json y out/femenino.json.

Uso:
  python scripts/atahockey/scrape_atahockey.py            # ambas ramas
  python scripts/atahockey/scrape_atahockey.py F --delay 1
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from scrapling.fetchers import Fetcher

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://atahockey.com/stats/stats.php"
OUT_DIR = Path(__file__).parent / "out"

# consultas iniciales embebidas en las páginas WP (traen el combo con todo lo vigente)
SEMILLAS = {
    "M": "EquipoId=11&NivId=1&FixId=240&FixSexo=M",
    "F": "EquipoId=2&NivId=1&FixId=241&FixSexo=F",
}

MAX_FECHAS = 40  # tope de seguridad al paginar resultados

# Clases `estado_N` de una fila de resultado que significan "partido jugado".
# El censo que lo sostiene está en parsear_fecha_actual.
JUGADOS = frozenset({4, 5})


def limpiar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def get(query: str):
    return Fetcher.get(f"{BASE}?{query}", stealthy_headers=True)


def parsear_opciones(page) -> list[dict]:
    """El select #combo_equipos lista todas las combinaciones torneo × división."""
    opciones = []
    for opt in page.css("#combo_equipos option"):
        valor = (opt.attrib.get("value") or "").rstrip("&T=").strip()
        titulo = limpiar(opt.get_all_text(strip=True))
        if valor and titulo:
            opciones.append({"titulo": titulo, "query": valor})
    return opciones


def parsear_posiciones(page) -> list[dict]:
    filas = []
    for tabla in page.css("table.tablaPos"):
        for tr in tabla.css("tr"):
            celdas = [limpiar(td.get_all_text(strip=True)) for td in tr.css("td")]
            if len(celdas) >= 10 and celdas[0].isdigit():
                def num(v: str) -> int:
                    return int(v) if v.lstrip("-").isdigit() else 0
                filas.append(
                    {
                        "pos": int(celdas[0]),
                        "equipo": celdas[1],
                        "pj": num(celdas[2]),
                        "pg": num(celdas[3]),
                        "pe": num(celdas[4]),
                        "pp": num(celdas[5]),
                        "tf": num(celdas[6]),
                        "tc": num(celdas[7]),
                        "td": num(celdas[8]),
                        "pts": num(celdas[9]),
                    }
                )
    return filas


def parsear_playoffs(page) -> list[dict]:
    instancias = []
    tabla_po = page.css("#table_play_off")
    if not tabla_po:
        return instancias
    for columna in tabla_po[0].css("td[width='260px']"):
        titulos = columna.css(".titulo_instancia")
        nombre = limpiar(titulos[0].get_all_text(strip=True)) if titulos else None
        cruces = []
        for cruce in columna.css("table.tabla_cruce"):
            equipos = [limpiar(td.get_all_text(strip=True)) for td in cruce.css("td.nombreClub")]
            resultados = [limpiar(td.get_all_text(strip=True)) for td in cruce.css("td.resultPOF")]
            puntos = [limpiar(td.get_all_text(strip=True)) for td in cruce.css("td.puntosPOF")]
            fechas = [limpiar(td.get_all_text(strip=True)) for td in cruce.css("td.fechaPartPOF")]
            def num(lista: list[str], i: int) -> int | None:
                return int(lista[i]) if i < len(lista) and lista[i].lstrip("-").isdigit() else None
            if equipos:
                cruces.append(
                    {
                        "equipo1": equipos[0],
                        "resultado1": num(resultados, 0),
                        "puntos1": num(puntos, 0),
                        "equipo2": equipos[1] if len(equipos) > 1 else None,
                        "resultado2": num(resultados, 1),
                        "puntos2": num(puntos, 1),
                        "fecha": fechas[0] if fechas else None,
                    }
                )
        if nombre or cruces:
            instancias.append({"instancia": nombre, "cruces": cruces})
    return instancias


RE_FECHA_HEAD = re.compile(r"(.*?)\|?\s*RESULTADOS\s*\|\s*FECHA\s+(\d+)")


def parsear_fecha_actual(page) -> tuple[int | None, str | None, list[dict]]:
    """Devuelve (nro de fecha, rueda, partidos) del bloque RESULTADOS visible."""
    nro, rueda, partidos = None, None, []
    tablas = page.css("table.tablaHead, table.tablaRes")
    en_resultados = False
    for tabla in tablas:
        clase = tabla.attrib.get("class", "")
        texto = limpiar(tabla.get_all_text(strip=True))
        if "tablaHead" in clase:
            m = RE_FECHA_HEAD.search(texto)
            if m:
                rueda = limpiar(m.group(1)) or None
                nro = int(m.group(2))
                en_resultados = True
            else:
                en_resultados = False  # GOLEADORES u otro bloque
            continue
        if not en_resultados:
            continue
        for tr in tabla.css("tr"):
            celdas = [limpiar(td.get_all_text(strip=True)) for td in tr.css("td")]
            # fecha | local | goles | vs | goles | visitante
            if len(celdas) == 6 and celdas[3].lower() == "vs":
                # El 0-0 de un partido que todavía no se jugó es idéntico al de
                # un empate: ATA pinta el marcador vacío como cero. Lo que los
                # separa es la clase de la fila. Censo sobre 334 filas de cinco
                # divisiones de las dos ramas:
                #
                #   estado_1 → 146 filas, las 146 en 0-0 y ninguna con goles
                #   estado_4 →  14 filas, 13 con goles
                #   estado_5 → 174 filas, 171 con goles
                #
                # O sea: 1 es programado, 4 y 5 jugados (sus pocos 0-0 son
                # empates de verdad). Sin esto la temporada que falta jugar
                # entra como empates y la tabla miente: PJ=14 donde la fuente
                # dice 2. Un estado desconocido se toma como NO jugado, que es
                # el error seguro: omite un resultado en vez de inventarlo.
                estado = re.search(r"estado_(\d+)", tr.attrib.get("class", ""))
                estado_nro = int(estado.group(1)) if estado else None
                jugado = estado_nro in JUGADOS

                def num(v: str) -> int | None:
                    return int(v) if v.lstrip("-").isdigit() else None
                fecha_iso = None
                m_f = re.match(r"(\d{2})/(\d{2})/(\d{4})", celdas[0])
                if m_f:
                    fecha_iso = f"{m_f.group(3)}-{m_f.group(2)}-{m_f.group(1)}"
                partidos.append(
                    {
                        "fecha": fecha_iso,
                        "local": celdas[1],
                        "goles_local": num(celdas[2]) if jugado else None,
                        "goles_visitante": num(celdas[4]) if jugado else None,
                        "visitante": celdas[5],
                        "jugado": jugado,
                        "estado": estado_nro,
                    }
                )
        en_resultados = False
    return nro, rueda, partidos


def parsear_goleadores(page) -> list[dict]:
    goleadores = []
    tablas = page.css("table.tablaHead, table.tablaRes")
    en_goleadores = False
    for tabla in tablas:
        clase = tabla.attrib.get("class", "")
        texto = limpiar(tabla.get_all_text(strip=True))
        if "tablaHead" in clase:
            en_goleadores = texto.upper().startswith("GOLEADORES")
            continue
        if not en_goleadores:
            continue
        for tr in tabla.css("tr"):
            celdas = [limpiar(td.get_all_text(strip=True)) for td in tr.css("td")]
            if len(celdas) == 2 and celdas[1].isdigit():
                m = re.match(r"(.+?)\s*\(([^)]+)\)\s*$", celdas[0])
                goleadores.append(
                    {
                        "jugador": limpiar(m.group(1)) if m else celdas[0],
                        "equipo": limpiar(m.group(2)) if m else None,
                        "goles": int(celdas[1]),
                    }
                )
        en_goleadores = False
    return goleadores


def parsear_fixture_pdf(page) -> str | None:
    for a in page.css("a"):
        href = a.attrib.get("href", "")
        if "marnetweb" in href and "arfix" in href.lower():
            return href
    return None


def cosechar_torneo(opcion: dict, delay: float) -> dict:
    page = get(opcion["query"])
    torneo: dict = {
        **opcion,
        "fixture_pdf": parsear_fixture_pdf(page),
        "posiciones": parsear_posiciones(page),
        "playoffs": parsear_playoffs(page),
        "fechas": [],
        "goleadores": parsear_goleadores(page),
    }
    # la página inicial muestra la última fecha; recorrer 1..N hasta repetir
    vistas: set[int] = set()
    nro, rueda, partidos = parsear_fecha_actual(page)
    if nro is not None:
        torneo["fechas"].append({"nro": nro, "rueda": rueda, "partidos": partidos})
        vistas.add(nro)
    for pedida in range(1, MAX_FECHAS + 1):
        if pedida in vistas:
            continue
        time.sleep(delay)
        pagina = get(f"{opcion['query']}&ultimaFecha={pedida}")
        nro, rueda, partidos = parsear_fecha_actual(pagina)
        if nro is None:
            break
        if nro in vistas:
            continue
        torneo["fechas"].append({"nro": nro, "rueda": rueda, "partidos": partidos})
        vistas.add(nro)
        if nro != pedida:
            # el servidor clava la fecha al rango real: pedimos fuera de rango
            break
    torneo["fechas"].sort(key=lambda f: f["nro"])
    return torneo


def cosechar_sexo(sexo: str, delay: float) -> dict:
    print(f"== {'masculino' if sexo == 'M' else 'femenino'} ==", flush=True)
    inicial = get(SEMILLAS[sexo])
    opciones = parsear_opciones(inicial)
    # la consulta semilla puede apuntar a un torneo viejo que no está en el combo
    if SEMILLAS[sexo] not in {o["query"] for o in opciones}:
        opciones.append({"titulo": None, "query": SEMILLAS[sexo]})
    print(f"  {len(opciones)} torneos/divisiones en el combo", flush=True)
    torneos = []
    for opcion in opciones:
        time.sleep(delay)
        try:
            t = cosechar_torneo(opcion, delay)
        except Exception as e:  # noqa: BLE001 - cosecha: anotar y seguir
            t = {**opcion, "error": str(e)}
        torneos.append(t)
        print(
            f"    {opcion['titulo'] or opcion['query']}: "
            f"{len(t.get('posiciones', []))} equipos, {len(t.get('fechas', []))} fechas, "
            f"{sum(len(f['partidos']) for f in t.get('fechas', []))} partidos",
            flush=True,
        )
    return {"sexo": sexo, "torneos": torneos}


def main() -> None:
    parser = argparse.ArgumentParser(description="Scraper de torneos de atahockey.com")
    parser.add_argument("ramas", nargs="*", choices=["M", "F"], help="ramas a cosechar (default: ambas)")
    parser.add_argument("--delay", type=float, default=0.4, help="pausa entre requests en segundos")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for sexo in args.ramas or ["M", "F"]:
        datos = cosechar_sexo(sexo, args.delay)
        destino = OUT_DIR / ("masculino.json" if sexo == "M" else "femenino.json")
        destino.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  -> {destino} ({len(datos['torneos'])} torneos)", flush=True)


if __name__ == "__main__":
    main()
