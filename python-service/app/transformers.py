"""Shape adapters: SofaScore payload -> shape that mimics what the Next.js
code already expects from FlashScore. Where the shapes diverge the response
includes the SofaScore raw value under `sofascore_raw_*` keys so the TS side
can extend without re-hitting the API.

Only fields used by the existing UI are mapped — anything not needed is
ignored to avoid over-fitting the upstream schema.
"""

from typing import Any


SOFASCORE_TEAM_ID_PREFIX = "ss-team-"
SOFASCORE_TOURNAMENT_ID_PREFIX = "ss-tour-"
SOFASCORE_MATCH_ID_PREFIX = "ss-match-"
SOFASCORE_PLAYER_ID_PREFIX = "ss-player-"


def _prefix(prefix: str, raw_id: Any) -> str:
    if raw_id is None:
        return ""
    return f"{prefix}{raw_id}"


def team_logo_url(team_id: int | None) -> str:
    if team_id is None:
        return ""
    return f"https://api.sofascore.com/api/v1/team/{team_id}/image"


def player_image_url(player_id: int | None) -> str:
    if player_id is None:
        return ""
    return f"https://api.sofascore.com/api/v1/player/{player_id}/image"


def _status_from_event(event: dict[str, Any]) -> str:
    status = event.get("status") or {}
    code = status.get("type") or status.get("code") or ""
    description = status.get("description") or ""
    if code == "inprogress":
        return description or "Live"
    if code == "finished":
        return "FT"
    if code == "notstarted":
        return "NS"
    if code == "postponed":
        return "POST"
    if code == "canceled":
        return "CANC"
    return description or "NS"


def _score(event: dict[str, Any]) -> dict[str, int | None]:
    home = event.get("homeScore") or {}
    away = event.get("awayScore") or {}
    return {
        "home": home.get("current") if "current" in home else home.get("display"),
        "away": away.get("current") if "current" in away else away.get("display"),
    }


def event_to_match(event: dict[str, Any]) -> dict[str, Any]:
    """Mimics the flattened FlashScore match shape used in API routes."""
    home_team = event.get("homeTeam") or {}
    away_team = event.get("awayTeam") or {}
    tournament = event.get("tournament") or {}
    category = tournament.get("category") or {}
    season = event.get("season") or {}
    score = _score(event)
    return {
        "match_id": _prefix(SOFASCORE_MATCH_ID_PREFIX, event.get("id")),
        "home_team": {
            "team_id": _prefix(SOFASCORE_TEAM_ID_PREFIX, home_team.get("id")),
            "name": home_team.get("name") or "",
            "short_name": home_team.get("shortName") or "",
            "small_image_path": team_logo_url(home_team.get("id")),
            "image_path": team_logo_url(home_team.get("id")),
            "team_url": None,
        },
        "away_team": {
            "team_id": _prefix(SOFASCORE_TEAM_ID_PREFIX, away_team.get("id")),
            "name": away_team.get("name") or "",
            "short_name": away_team.get("shortName") or "",
            "small_image_path": team_logo_url(away_team.get("id")),
            "image_path": team_logo_url(away_team.get("id")),
            "team_url": None,
        },
        "scores": score,
        "event_final_result": (
            f"{score['home']} - {score['away']}"
            if score["home"] is not None and score["away"] is not None
            else ""
        ),
        "match_status": _status_from_event(event),
        "timestamp": event.get("startTimestamp") or 0,
        "tournament_id": _prefix(SOFASCORE_TOURNAMENT_ID_PREFIX, tournament.get("id")),
        "tournament_name": tournament.get("name") or "",
        "tournament_stage_id": _prefix(SOFASCORE_TOURNAMENT_ID_PREFIX, tournament.get("id")),
        "country_name": category.get("country", {}).get("name") if category else None,
        "country_id": category.get("id") if category else None,
        "sport_id": "football",
        "season_id": season.get("id"),
        "season_name": season.get("name"),
    }


def group_matches_by_tournament(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return list[{tournament_id, name, matches: [...]}] — same shape FlashScore
    returns from /matches/list, so downstream `flattenFsMatches` works as-is."""
    by_tour: dict[str, dict[str, Any]] = {}
    for event in events:
        flat = event_to_match(event)
        tid = flat["tournament_id"] or "ss-tour-unknown"
        bucket = by_tour.get(tid)
        if not bucket:
            bucket = {
                "tournament_id": tid,
                "name": flat["tournament_name"],
                "country_name": flat["country_name"],
                "matches": [],
            }
            by_tour[tid] = bucket
        bucket["matches"].append(flat)
    return list(by_tour.values())


def event_to_match_details(event: dict[str, Any]) -> dict[str, Any]:
    home_team = event.get("homeTeam") or {}
    away_team = event.get("awayTeam") or {}
    tournament = event.get("tournament") or {}
    venue = event.get("venue") or {}
    return {
        "DATA": {
            "EVENT": {
                "event_id": _prefix(SOFASCORE_MATCH_ID_PREFIX, event.get("id")),
                "sofascore_id": event.get("id"),
                "home_team": {
                    "team_id": _prefix(SOFASCORE_TEAM_ID_PREFIX, home_team.get("id")),
                    "name": home_team.get("name") or "",
                    "short_name": home_team.get("shortName") or "",
                    "logo": team_logo_url(home_team.get("id")),
                },
                "away_team": {
                    "team_id": _prefix(SOFASCORE_TEAM_ID_PREFIX, away_team.get("id")),
                    "name": away_team.get("name") or "",
                    "short_name": away_team.get("shortName") or "",
                    "logo": team_logo_url(away_team.get("id")),
                },
                "tournament": {
                    "tournament_id": _prefix(SOFASCORE_TOURNAMENT_ID_PREFIX, tournament.get("id")),
                    "name": tournament.get("name") or "",
                },
                "status": _status_from_event(event),
                "start_timestamp": event.get("startTimestamp"),
                "scores": _score(event),
                "venue": {
                    "name": venue.get("stadium", {}).get("name") if venue else None,
                    "city": venue.get("city", {}).get("name") if venue else None,
                },
                "round": (event.get("roundInfo") or {}).get("round"),
            }
        }
    }


def team_details(team_payload: dict[str, Any]) -> dict[str, Any]:
    team = team_payload.get("team") or team_payload
    venue = team.get("venue") or {}
    country = team.get("country") or {}
    return {
        "DATA": {
            "id": _prefix(SOFASCORE_TEAM_ID_PREFIX, team.get("id")),
            "sofascore_id": team.get("id"),
            "name": team.get("name") or "",
            "short_name": team.get("shortName") or "",
            "image_path": team_logo_url(team.get("id")),
            "logo": team_logo_url(team.get("id")),
            "logo_url": team_logo_url(team.get("id")),
            "country": country.get("name"),
            "city": (venue.get("city") or {}).get("name") if venue else None,
            "stadium": (venue.get("stadium") or {}).get("name") if venue else None,
            "founded": team.get("foundationDateTimestamp"),
            "sport": "football",
            "supported_tabs": ["summary", "results", "fixtures", "squad"],
        }
    }


def squad_payload(squad: dict[str, Any]) -> dict[str, Any]:
    players = squad.get("players") or []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in players:
        player = entry.get("player") or {}
        position = player.get("position") or "Other"
        group_name = _position_group(position)
        grouped.setdefault(group_name, []).append(
            {
                "id": _prefix(SOFASCORE_PLAYER_ID_PREFIX, player.get("id")),
                "player_id": _prefix(SOFASCORE_PLAYER_ID_PREFIX, player.get("id")),
                "name": player.get("name") or "",
                "player_name": player.get("name") or "",
                "image_path": player_image_url(player.get("id")),
                "photo": player_image_url(player.get("id")),
                "jersey_number": player.get("jerseyNumber"),
                "shirt_number": player.get("jerseyNumber"),
                "number": player.get("jerseyNumber"),
                "position": position,
                "country": (player.get("country") or {}).get("name"),
            }
        )
    list_blocks = [{"name": name, "players": players_list} for name, players_list in grouped.items()]
    return {"DATA": [{"team_name": "", "tab_name": "Plantel", "list": list_blocks}]}


def _position_group(position_code: str | None) -> str:
    if not position_code:
        return "Otros"
    code = position_code.upper()
    if code.startswith("G"):
        return "Goalkeepers"
    if code.startswith("D"):
        return "Defenders"
    if code.startswith("M"):
        return "Midfielders"
    if code.startswith("F") or code.startswith("A"):
        return "Forwards"
    return "Otros"


def team_events_to_grouped(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Used for team results / team fixtures lists in the FlashScore shape."""
    return group_matches_by_tournament(events)


def tournament_details(payload: dict[str, Any]) -> dict[str, Any]:
    """Mimics FlashScore tournament details."""
    tournament = payload.get("uniqueTournament") or payload.get("tournament") or payload
    category = tournament.get("category") or {}
    sport = tournament.get("sport") or {}
    return {
        "DATA": {
            "id": _prefix(SOFASCORE_TOURNAMENT_ID_PREFIX, tournament.get("id")),
            "sofascore_id": tournament.get("id"),
            "name": tournament.get("name") or "",
            "display_name": tournament.get("name") or "",
            "slug": tournament.get("slug"),
            "image": (
                f"https://api.sofascore.com/api/v1/unique-tournament/{tournament.get('id')}/image"
                if tournament.get("id")
                else None
            ),
            "logo": (
                f"https://api.sofascore.com/api/v1/unique-tournament/{tournament.get('id')}/image"
                if tournament.get("id")
                else None
            ),
            "logo_url": (
                f"https://api.sofascore.com/api/v1/unique-tournament/{tournament.get('id')}/image"
                if tournament.get("id")
                else None
            ),
            "country": (category.get("country") or {}).get("name"),
            "country_id": category.get("id"),
            "sport": sport.get("slug") or "football",
            "tier": tournament.get("tier"),
        }
    }


def tournament_standings(payload: dict[str, Any]) -> dict[str, Any]:
    """Flatten SofaScore standings into a single ordered list keyed by group name."""
    standings_blocks = payload.get("standings") or []
    groups: list[dict[str, Any]] = []
    for block in standings_blocks:
        rows = block.get("rows") or []
        entries = []
        for row in rows:
            team = row.get("team") or {}
            entries.append({
                "position": row.get("position"),
                "team_id": _prefix(SOFASCORE_TEAM_ID_PREFIX, team.get("id")),
                "team_name": team.get("name") or "",
                "team_logo": team_logo_url(team.get("id")),
                "played": row.get("matches"),
                "wins": row.get("wins"),
                "draws": row.get("draws"),
                "losses": row.get("losses"),
                "goals_for": row.get("scoresFor"),
                "goals_against": row.get("scoresAgainst"),
                "goal_difference": (row.get("scoresFor") or 0) - (row.get("scoresAgainst") or 0),
                "points": row.get("points"),
                "form": row.get("promotion") or row.get("descriptions"),
            })
        groups.append({
            "group_name": block.get("name") or "",
            "rows": entries,
        })
    return {"DATA": groups}


def search_results(payload: dict[str, Any]) -> dict[str, Any]:
    """Adapt SofaScore /search/all into a uniform shape (teams, players, tournaments)."""
    teams = []
    players = []
    tournaments = []
    for hit in payload.get("results") or []:
        entity = hit.get("entity") or {}
        kind = hit.get("type") or ""
        if kind == "team":
            teams.append({
                "id": _prefix(SOFASCORE_TEAM_ID_PREFIX, entity.get("id")),
                "name": entity.get("name") or "",
                "short_name": entity.get("shortName") or "",
                "country": (entity.get("country") or {}).get("name"),
                "image_path": team_logo_url(entity.get("id")),
                "logo": team_logo_url(entity.get("id")),
                "sport": "football",
            })
        elif kind == "player":
            team = entity.get("team") or {}
            players.append({
                "id": _prefix(SOFASCORE_PLAYER_ID_PREFIX, entity.get("id")),
                "name": entity.get("name") or "",
                "short_name": entity.get("shortName") or "",
                "image_path": player_image_url(entity.get("id")),
                "photo": player_image_url(entity.get("id")),
                "country": (entity.get("country") or {}).get("name"),
                "team": {
                    "id": _prefix(SOFASCORE_TEAM_ID_PREFIX, team.get("id")),
                    "name": team.get("name") or "",
                    "logo": team_logo_url(team.get("id")),
                } if team else None,
            })
        elif kind in ("uniqueTournament", "tournament"):
            tournaments.append({
                "id": _prefix(SOFASCORE_TOURNAMENT_ID_PREFIX, entity.get("id")),
                "name": entity.get("name") or "",
                "country": (entity.get("category", {}) or {}).get("name"),
                "sport": "football",
            })
    return {
        "DATA": {
            "teams": teams,
            "players": players,
            "tournaments": tournaments,
        }
    }


def player_details(player_payload: dict[str, Any]) -> dict[str, Any]:
    player = player_payload.get("player") or player_payload
    team = player.get("team") or {}
    country = player.get("country") or {}
    return {
        "DATA": {
            "id": _prefix(SOFASCORE_PLAYER_ID_PREFIX, player.get("id")),
            "sofascore_id": player.get("id"),
            "name": player.get("name") or "",
            "short_name": player.get("shortName") or "",
            "image_path": player_image_url(player.get("id")),
            "photo": player_image_url(player.get("id")),
            "birth_date": player.get("dateOfBirthTimestamp"),
            "height": player.get("height"),
            "weight": player.get("weight"),
            "position": player.get("position"),
            "shirt_number": player.get("shirtNumber"),
            "nationality": country.get("name"),
            "team": {
                "team_id": _prefix(SOFASCORE_TEAM_ID_PREFIX, team.get("id")),
                "name": team.get("name") or "",
                "logo": team_logo_url(team.get("id")),
            }
            if team
            else None,
        }
    }
