"""
Sofascore stats scraper -> Supabase.

Pulls aggregated team and player stats for one (league, season) pair via
ScraperFC.Sofascore and upserts them into:
  - public.sofascore_seasons
  - public.sofascore_team_stats
  - public.sofascore_player_stats

Reads via:
  SUPABASE_URL          (e.g. https://vxsolicapdcpemfsahbk.supabase.co)
  SUPABASE_SERVICE_ROLE (service_role key — bypasses RLS)

Env or CLI flags select what to scrape:
  --league   "Argentina Liga Profesional"      (default)
  --season   "2026"                              (default: current calendar year)
  --skip-players  to scrape only team stats
  --positions Goalkeepers,Defenders,Midfielders,Forwards  (default: all)

Usage:
  python scrape_stats.py --league "Argentina Liga Profesional" --season 2026
"""

from __future__ import annotations

import argparse
import math
import os
import re
import sys
import time
from datetime import datetime
from typing import Any

import pandas as pd
import requests
import ScraperFC as sfc


SUPABASE_REST_TIMEOUT = 30
UPSERT_CHUNK = 200

DEFAULT_POSITIONS = ["Goalkeepers", "Defenders", "Midfielders", "Forwards"]


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def clean_value(value: Any) -> Any:
    """Return a JSON-safe value, or None if missing."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except (ValueError, AttributeError):
            pass
    return value


def row_stats(row: pd.Series, drop: set[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col, value in row.items():
        if col in drop:
            continue
        cleaned = clean_value(value)
        if cleaned is None:
            continue
        out[col] = cleaned
    return out


class SupabaseClient:
    def __init__(self, url: str, service_key: str) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal,resolution=merge-duplicates",
        }

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
        if not rows:
            return
        url = f"{self.base}/{table}?on_conflict={on_conflict}"
        for i in range(0, len(rows), UPSERT_CHUNK):
            chunk = rows[i : i + UPSERT_CHUNK]
            resp = requests.post(url, json=chunk, headers=self.headers, timeout=SUPABASE_REST_TIMEOUT)
            if resp.status_code >= 300:
                raise RuntimeError(f"Supabase upsert {table} failed: {resp.status_code} {resp.text}")

    def delete_season_rows(self, table: str, league_key: str, season_year: str) -> None:
        url = (
            f"{self.base}/{table}"
            f"?league_key=eq.{league_key}&season_year=eq.{season_year}"
        )
        resp = requests.delete(url, headers=self.headers, timeout=SUPABASE_REST_TIMEOUT)
        if resp.status_code >= 300:
            raise RuntimeError(f"Supabase delete {table} failed: {resp.status_code} {resp.text}")


def build_team_rows(league_key: str, season: str, df: pd.DataFrame) -> list[dict[str, Any]]:
    drop = {"teamName", "teamId"}
    now = datetime.utcnow().isoformat() + "Z"
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        team_id = clean_value(row.get("teamId"))
        if team_id is None:
            continue
        rows.append(
            {
                "league_key": league_key,
                "season_year": season,
                "team_id": int(team_id),
                "team_name": str(row.get("teamName") or ""),
                "stats": row_stats(row, drop),
                "fetched_at": now,
            }
        )
    return rows


def build_player_rows(league_key: str, season: str, df: pd.DataFrame) -> list[dict[str, Any]]:
    drop = {"player", "team", "player id", "team id"}
    now = datetime.utcnow().isoformat() + "Z"
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        player_id = clean_value(row.get("player id"))
        if player_id is None:
            continue
        team_id = clean_value(row.get("team id"))
        rows.append(
            {
                "league_key": league_key,
                "season_year": season,
                "player_id": int(player_id),
                "player_name": str(row.get("player") or ""),
                "team_id": int(team_id) if team_id is not None else None,
                "team_name": str(row.get("team")) if clean_value(row.get("team")) is not None else None,
                "position": None,  # ScraperFC league-stats DF does not expose per-row position
                "stats": row_stats(row, drop),
                "fetched_at": now,
            }
        )
    return rows


def scrape_and_upsert(
    league: str,
    season: str,
    supa: SupabaseClient,
    *,
    skip_players: bool,
    positions: list[str],
) -> None:
    league_key = slugify(league)
    ss = sfc.Sofascore()

    seasons = ss.get_valid_seasons(league)
    if season not in seasons:
        raise SystemExit(
            f"Season {season!r} not valid for {league!r}. Valid: {list(seasons.keys())[:8]}..."
        )
    season_id = int(seasons[season])

    started = time.time()
    print(f"[sofascore] {league} {season} (id={season_id}) — scraping…")

    team_df = ss.scrape_team_league_stats(year=season, league=league)
    print(f"[sofascore] team stats: {team_df.shape[0]} rows × {team_df.shape[1]} cols")
    team_rows = build_team_rows(league_key, season, team_df)

    player_rows: list[dict[str, Any]] = []
    if not skip_players:
        player_df = ss.scrape_player_league_stats(
            year=season, league=league, selected_positions=positions
        )
        print(f"[sofascore] player stats: {player_df.shape[0]} rows × {player_df.shape[1]} cols")
        player_rows = build_player_rows(league_key, season, player_df)

    # Upsert season row first (FK target).
    supa.upsert(
        "sofascore_seasons",
        [
            {
                "league_key": league_key,
                "league_name": league,
                "season_year": season,
                "season_id": season_id,
                "last_refreshed_at": datetime.utcnow().isoformat() + "Z",
                "last_status": "ok",
                "last_error": None,
            }
        ],
        on_conflict="league_key,season_year",
    )

    # Replace existing rows so removed teams/players don't linger.
    supa.delete_season_rows("sofascore_team_stats", league_key, season)
    supa.upsert("sofascore_team_stats", team_rows, on_conflict="league_key,season_year,team_id")

    if not skip_players:
        supa.delete_season_rows("sofascore_player_stats", league_key, season)
        supa.upsert(
            "sofascore_player_stats", player_rows, on_conflict="league_key,season_year,player_id"
        )

    elapsed = time.time() - started
    print(
        f"[sofascore] done — teams={len(team_rows)} players={len(player_rows)} "
        f"in {elapsed:.1f}s"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--league",
        default=os.environ.get("SOFASCORE_LEAGUE", "Argentina Liga Profesional"),
    )
    parser.add_argument(
        "--season",
        default=os.environ.get("SOFASCORE_SEASON", str(datetime.utcnow().year)),
    )
    parser.add_argument("--skip-players", action="store_true", help="Only scrape team stats")
    parser.add_argument(
        "--positions",
        default=",".join(DEFAULT_POSITIONS),
        help="Comma-separated player positions to include",
    )
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set in environment.")

    positions = [p.strip() for p in args.positions.split(",") if p.strip()]
    supa = SupabaseClient(url, key)
    try:
        scrape_and_upsert(
            args.league,
            args.season,
            supa,
            skip_players=args.skip_players,
            positions=positions,
        )
    except SystemExit:
        raise
    except Exception as exc:
        league_key = slugify(args.league)
        try:
            supa.upsert(
                "sofascore_seasons",
                [
                    {
                        "league_key": league_key,
                        "league_name": args.league,
                        "season_year": args.season,
                        "season_id": 0,
                        "last_refreshed_at": datetime.utcnow().isoformat() + "Z",
                        "last_status": "error",
                        "last_error": str(exc)[:500],
                    }
                ],
                on_conflict="league_key,season_year",
            )
        finally:
            raise


if __name__ == "__main__":
    main()
