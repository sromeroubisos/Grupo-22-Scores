#!/usr/bin/env python
"""
Scraper de torneos de la AAMH (Asociacion Amateur Marplatense de Hockey) con Scrapling.

El sitio es WordPress con un tema propio (prefijo `gah-`). Todo el contenido de
torneos se renderiza en el servidor, asi que alcanza con el fetcher HTTP: no hay
que levantar un navegador.

Rutas que usa:
  /?gah-ty=<anio>                     catalogo de torneos de ese anio (menu)
  /resultados/torneo/<tid>/<cid>/     posiciones + fixture + estadisticas
  /resultados/partido/<mid>/          ficha del partido (formaciones, acciones)

Uso:
  python scrape_aamh.py --years 2026
  python scrape_aamh.py --years 2016-2026 --out data/aamh
  python scrape_aamh.py --years 2026 --matches      # baja tambien cada partido
  python scrape_aamh.py --list-only                 # solo el catalogo
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from scrapling.fetchers import Fetcher

BASE = "https://aamh.com.ar"
DEFAULT_DELAY = 0.6
RETRIES = 3

# Encabezados de la tabla de posiciones, en el orden en que los emite el tema.
STANDING_KEYS = ["pts", "pj", "pg", "pe", "pp", "gf", "gc"]


# --------------------------------------------------------------------------- #
# utilidades
# --------------------------------------------------------------------------- #

def clean(value: str | None) -> str:
    """Colapsa el espacio en blanco del HTML indentado del tema."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def text_of(node, selector: str | None = None) -> str:
    """Texto de un nodo (o del primer descendiente que matchee `selector`)."""
    target = node
    if selector:
        found = node.css(selector)
        if not found:
            return ""
        target = found[0]
    return clean(target.get_all_text())


def to_int(value: str) -> int | None:
    match = re.search(r"-?\d+", value or "")
    return int(match.group(0)) if match else None


def fetch(url: str, delay: float) -> Any:
    """GET con reintentos. Scrapling ya rota headers y resuelve la codificacion."""
    last: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            response = Fetcher.get(url, timeout=30)
            if response.status == 200:
                time.sleep(delay)
                return response
            last = RuntimeError("HTTP " + str(response.status))
        except Exception as exc:  # red caida, timeout, DNS
            last = exc
        time.sleep(delay * attempt * 2)
    raise RuntimeError("No se pudo bajar " + url + ": " + str(last))


# --------------------------------------------------------------------------- #
# modelo
# --------------------------------------------------------------------------- #

@dataclass
class TournamentRef:
    year: int
    tournament_id: int
    category_id: int
    division: str          # Primera, Intermedia, Sub 19, Sub 16, Sub 15, Sub 14
    gender: str            # Damas / Caballeros ('' si el menu no lo separa)
    name: str              # Preparacion A, Top Nivel 1 A Tira, ...
    url: str


@dataclass
class Tournament:
    year: int
    tournament_id: int
    category_id: int
    division: str
    gender: str
    name: str
    url: str
    title: str = ""
    standings: list[dict] = field(default_factory=list)
    rounds: list[dict] = field(default_factory=list)
    top_scorers: list[dict] = field(default_factory=list)
    yellow_cards: list[dict] = field(default_factory=list)
    red_cards: list[dict] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# catalogo: que torneos hay en un anio
# --------------------------------------------------------------------------- #

def discover_year(year: int, delay: float) -> list[TournamentRef]:
    """
    El selector de anio recarga la home con `?gah-ty=<anio>` y el menu de torneos
    pasa a listar los de ese anio. La jerarquia es division > genero > torneo:
    el genero viaja como `li.menu-item-title`, que no es un item sino un rotulo
    que separa los grupos, asi que hay que leerlo por posicion.
    """
    page = fetch(BASE + "/?gah-ty=" + str(year), delay)
    refs: list[TournamentRef] = []

    for block in page.css(".tournaments-menu-container > ul.menu > li"):
        division = text_of(block, "a")
        gender = ""
        for item in block.css("ul.sub-menu > li"):
            classes = item.attrib.get("class", "")
            if "menu-item-title" in classes:
                gender = text_of(item)
                continue

            links = item.css("a")
            if not links:
                continue
            href = links[0].attrib.get("href", "")
            match = re.search(r"/resultados/torneo/(\d+)/(\d+)", href)
            if not match:
                continue  # Nivelacion A/B son paginas de WordPress, no torneos

            refs.append(
                TournamentRef(
                    year=year,
                    tournament_id=int(match.group(1)),
                    category_id=int(match.group(2)),
                    division=division,
                    gender=gender,
                    name=text_of(links[0]),
                    url=BASE + href.rstrip("/") + "/",
                )
            )

    return refs


# --------------------------------------------------------------------------- #
# torneo: posiciones, fixture, estadisticas
# --------------------------------------------------------------------------- #

def parse_standings(page) -> list[dict]:
    rows: list[dict] = []
    for item in page.css(".tab-positions .positions .items > .item"):
        values = [to_int(text_of(v)) for v in item.css(".results .value")]
        row = {
            "position": to_int(text_of(item, ".position")),
            "team": text_of(item, ".team"),
        }
        row.update(dict(zip(STANDING_KEYS, values)))
        rows.append(row)
    return rows


def parse_match_row(node) -> dict:
    """
    Una fila del fixture. El marcador viene en un solo div `.goals` con los dos
    numeros y un guion: si el partido no se jugo todavia, no hay numeros.
    """
    href = node.attrib.get("href", "")
    match_id = to_int(href.rsplit("/", 1)[-1]) if "partido" in href else None

    teams = node.css(".team")
    names = [text_of(t, ".name") for t in teams]
    logos = []
    for t in teams:
        logo_nodes = t.css(".logo")
        style = logo_nodes[0].attrib.get("style", "") if logo_nodes else ""
        found = re.search(r"url\('([^']+)'\)", style)
        logos.append(BASE + found.group(1) if found else None)

    goals = re.findall(r"\d+", text_of(node, ".goals"))

    return {
        "match_id": match_id,
        "url": BASE + href.rstrip("/") + "/" if href else None,
        "date": text_of(node, ".date"),
        "home": names[0] if len(names) > 0 else "",
        "away": names[1] if len(names) > 1 else "",
        "home_logo": logos[0] if len(logos) > 0 else None,
        "away_logo": logos[1] if len(logos) > 1 else None,
        "home_goals": int(goals[0]) if len(goals) == 2 else None,
        "away_goals": int(goals[1]) if len(goals) == 2 else None,
        "played": len(goals) == 2,
    }


def parse_rounds(page) -> list[dict]:
    """
    Los rotulos de las solapas viven en `.tabs-index` y los contenidos en
    `.tabs-contents`, apareados por el `gah_select_tournament_tab(...)` del
    onclick. Emparejar por ese id evita depender del orden.
    """
    labels: dict[str, str] = {}
    for tab in page.css(".tabs-index .tab"):
        found = re.search(r"'([\w-]+)'", tab.attrib.get("onclick", ""))
        if found:
            labels[found.group(1)] = text_of(tab)

    rounds: list[dict] = []
    for content in page.css(".tabs-contents > .tab"):
        classes = content.attrib.get("class", "")
        found = re.search(r"tab-(fixture-round-\d+)", classes)
        if not found:
            continue
        key = found.group(1)
        rounds.append(
            {
                "key": key,
                "label": labels.get(key, key),
                "matches": [parse_match_row(m) for m in content.css(".matches > a")],
            }
        )
    return rounds


def parse_players_table(page, selector: str, value_key: str) -> list[dict]:
    rows: list[dict] = []
    for player in page.css(selector + " .players-table .player"):
        rows.append(
            {
                "position": to_int(text_of(player, ".position")),
                "name": text_of(player, ".name"),
                value_key: to_int(text_of(player, ".player-" + value_key)),
            }
        )
    return rows


def scrape_tournament(ref: TournamentRef, delay: float) -> Tournament:
    page = fetch(ref.url, delay)
    return Tournament(
        **asdict(ref),
        title=text_of(page, ".single-tournament .block-title"),
        standings=parse_standings(page),
        rounds=parse_rounds(page),
        top_scorers=parse_players_table(page, ".top-scorers", "goals"),
        yellow_cards=parse_players_table(page, ".cards .yellow-cards", "cards"),
        red_cards=parse_players_table(page, ".cards .red-cards", "cards"),
    )


# --------------------------------------------------------------------------- #
# ficha de partido
# --------------------------------------------------------------------------- #

def scrape_match(match_id: int, delay: float) -> dict:
    page = fetch(BASE + "/resultados/partido/" + str(match_id) + "/", delay)

    teams = page.css(".match-results .team")
    goals = re.findall(r"\d+", text_of(page, ".match-results .goals"))

    lineups = []
    for team in page.css(".match-teams > .team"):
        players = []
        for item in team.css(".players .item"):
            raw = text_of(item, ".name")
            players.append(
                {
                    "name": clean(raw.replace("(Cap.)", "")),
                    "captain": "(Cap.)" in raw,
                }
            )
        lineups.append(players)

    actions = [
        {
            "action": text_of(item, ".description"),
            "player": text_of(item, ".player .name"),
            "team": text_of(item, ".player .team").strip("()"),
        }
        for item in page.css(".match-actions .items > .item")
    ]

    authorities = [
        {
            "role": text_of(a, ".label").rstrip(":"),
            "name": text_of(a, ".name"),
        }
        for a in page.css(".match-authorities .authority")
    ]

    return {
        "match_id": match_id,
        "url": BASE + "/resultados/partido/" + str(match_id) + "/",
        "category": text_of(page, ".match-info .category"),
        "datetime": text_of(page, ".match-info .datetime"),
        "court": text_of(page, ".match-info .court"),
        "home": text_of(teams[0], ".name") if len(teams) > 0 else "",
        "away": text_of(teams[1], ".name") if len(teams) > 1 else "",
        "home_goals": int(goals[0]) if len(goals) == 2 else None,
        "away_goals": int(goals[1]) if len(goals) == 2 else None,
        "home_lineup": lineups[0] if len(lineups) > 0 else [],
        "away_lineup": lineups[1] if len(lineups) > 1 else [],
        "actions": actions,
        "authorities": authorities,
    }


# --------------------------------------------------------------------------- #
# salida
# --------------------------------------------------------------------------- #

def write_csvs(out_dir: Path, tournaments: list[Tournament]) -> None:
    matches_path = out_dir / "partidos.csv"
    with matches_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["anio", "division", "genero", "torneo", "torneo_id", "categoria_id",
             "rueda", "match_id", "fecha", "local", "gl", "gv", "visitante", "jugado"]
        )
        for t in tournaments:
            for r in t.rounds:
                for m in r["matches"]:
                    writer.writerow(
                        [t.year, t.division, t.gender, t.name, t.tournament_id,
                         t.category_id, r["label"], m["match_id"], m["date"],
                         m["home"], m["home_goals"], m["away_goals"], m["away"],
                         "si" if m["played"] else "no"]
                    )

    standings_path = out_dir / "posiciones.csv"
    with standings_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["anio", "division", "genero", "torneo", "torneo_id", "categoria_id",
             "pos", "equipo"] + STANDING_KEYS
        )
        for t in tournaments:
            for row in t.standings:
                writer.writerow(
                    [t.year, t.division, t.gender, t.name, t.tournament_id,
                     t.category_id, row["position"], row["team"]]
                    + [row.get(k) for k in STANDING_KEYS]
                )

    print("  CSV  -> " + matches_path.name + ", " + standings_path.name)


def parse_years(spec: str) -> list[int]:
    years: list[int] = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if "-" in chunk:
            start, end = chunk.split("-", 1)
            years.extend(range(int(start), int(end) + 1))
        elif chunk:
            years.append(int(chunk))
    return sorted(set(years), reverse=True)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scraper de torneos de la AAMH")
    parser.add_argument("--years", default="2026",
                        help="anio, lista (2024,2025) o rango (2016-2026)")
    parser.add_argument("--out", default="data/aamh", help="carpeta de salida")
    parser.add_argument("--matches", action="store_true",
                        help="baja tambien la ficha de cada partido (lento)")
    parser.add_argument("--list-only", action="store_true",
                        help="solo lista los torneos, no baja el detalle")
    parser.add_argument("--limit", type=int, default=0,
                        help="corta despues de N torneos por anio (para probar)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY,
                        help="pausa entre pedidos en segundos")
    args = parser.parse_args(list(argv) if argv is not None else None)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    all_tournaments: list[Tournament] = []

    for year in parse_years(args.years):
        print("\n== " + str(year) + " ==")
        refs = discover_year(year, args.delay)
        print("  " + str(len(refs)) + " torneos en el menu")

        if args.list_only:
            payload = [asdict(r) for r in refs]
            (out_dir / ("catalogo-" + str(year) + ".json")).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            continue

        if args.limit:
            refs = refs[: args.limit]

        tournaments: list[Tournament] = []
        for index, ref in enumerate(refs, 1):
            label = ref.division + "/" + ref.gender + "/" + ref.name
            try:
                tournament = scrape_tournament(ref, args.delay)
            except RuntimeError as exc:
                print("  [" + str(index) + "/" + str(len(refs)) + "] " + label
                      + " -- ERROR: " + str(exc))
                continue
            played = sum(
                1 for r in tournament.rounds for m in r["matches"] if m["played"]
            )
            total = sum(len(r["matches"]) for r in tournament.rounds)
            print("  [" + str(index) + "/" + str(len(refs)) + "] " + label + ": "
                  + str(len(tournament.standings)) + " equipos, "
                  + str(played) + "/" + str(total) + " partidos")
            tournaments.append(tournament)

        matches: list[dict] = []
        if args.matches:
            ids = [m["match_id"] for t in tournaments for r in t.rounds
                   for m in r["matches"] if m["match_id"] and m["played"]]
            print("  bajando " + str(len(ids)) + " fichas de partido...")
            for position, match_id in enumerate(ids, 1):
                try:
                    matches.append(scrape_match(match_id, args.delay))
                except RuntimeError as exc:
                    print("    partido " + str(match_id) + " -- ERROR: " + str(exc))
                if position % 25 == 0:
                    print("    " + str(position) + "/" + str(len(ids)))

        payload = {
            "source": BASE,
            "year": year,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "tournaments": [asdict(t) for t in tournaments],
            "matches": matches,
        }
        path = out_dir / ("aamh-" + str(year) + ".json")
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                        encoding="utf-8")
        print("  JSON -> " + str(path))
        all_tournaments.extend(tournaments)

    if all_tournaments:
        write_csvs(out_dir, all_tournaments)

    return 0


if __name__ == "__main__":
    sys.exit(main())
