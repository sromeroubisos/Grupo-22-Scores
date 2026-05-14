"""High level service: raw SofaScore endpoints + LanusStats helpers.

Functions return data already shaped via app.transformers so the FastAPI
route handlers stay thin.

LanusStats `sofascore_request` is just a thin requests wrapper, but its
higher-level helpers (`get_match_shotmap`, `get_lineups`, etc.) operate on
SofaScore match URLs and return pandas DataFrames. We expose those for the
analytics endpoints; raw API calls cover the rest.
"""

import logging
from typing import Any

from app import transformers
from app.cache import cache
from app.settings import get_settings
from app.sofascore_http import SofaScoreError, get_client

logger = logging.getLogger(__name__)


def _try_lanus_sofascore():
    try:
        from LanusStats import SofaScore  # type: ignore
        return SofaScore()
    except Exception as exc:
        logger.info("LanusStats SofaScore unavailable: %s", exc)
        return None


_lanus = _try_lanus_sofascore()


def matches_by_date(date_iso: str) -> dict[str, Any]:
    settings = get_settings()
    key = f"matches:{date_iso}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/sport/football/scheduled-events/{date_iso}")
    events = (payload or {}).get("events") or []
    grouped = transformers.group_matches_by_tournament(events)
    result = {"DATA": grouped, "count": len(events)}
    cache.set(key, result, settings.cache_ttl_matches)
    return result


def live_matches() -> dict[str, Any]:
    settings = get_settings()
    key = "matches:live"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json("/sport/football/events/live")
    events = (payload or {}).get("events") or []
    grouped = transformers.group_matches_by_tournament(events)
    result = {"DATA": grouped, "count": len(events)}
    cache.set(key, result, settings.cache_ttl_live)
    return result


def match_details(match_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"match:{match_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/event/{match_id}")
    if not payload:
        return None
    event = payload.get("event") or payload
    result = transformers.event_to_match_details(event)
    cache.set(key, result, settings.cache_ttl_details)
    return result


def match_lineups(match_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"match-lineups:{match_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/event/{match_id}/lineups")
    if payload is None:
        return None
    result = {"DATA": payload}
    cache.set(key, result, settings.cache_ttl_details)
    return result


def match_statistics(match_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"match-stats:{match_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/event/{match_id}/statistics")
    if payload is None:
        return None
    result = {"DATA": payload}
    cache.set(key, result, settings.cache_ttl_details)
    return result


def match_shotmap(match_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"match-shotmap:{match_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/event/{match_id}/shotmap")
    if payload is None:
        return None
    result = {"DATA": payload}
    cache.set(key, result, settings.cache_ttl_details)
    return result


def match_h2h(match_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"match-h2h:{match_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/event/{match_id}/h2h/events")
    if payload is None:
        return None
    result = {"DATA": payload}
    cache.set(key, result, settings.cache_ttl_details)
    return result


def team_bundle(team_id: int) -> dict[str, Any] | None:
    """Returns details + squad + recent results + upcoming fixtures.
    Mimics what /api/teams currently aggregates from FlashScore.
    """
    settings = get_settings()
    key = f"team:{team_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    try:
        details_raw = client.get_json(f"/team/{team_id}")
    except SofaScoreError:
        details_raw = None
    if not details_raw:
        return None

    squad_raw = _safe(lambda: client.get_json(f"/team/{team_id}/players"))
    last_raw = _safe(lambda: client.get_json(f"/team/{team_id}/events/last/0"))
    next_raw = _safe(lambda: client.get_json(f"/team/{team_id}/events/next/0"))

    last_events = ((last_raw or {}).get("events") or [])[:30]
    next_events = ((next_raw or {}).get("events") or [])[:30]

    result = {
        "details": transformers.team_details(details_raw),
        "squad": transformers.squad_payload(squad_raw or {}),
        "results": {"DATA": transformers.team_events_to_grouped(last_events)},
        "fixtures": {"DATA": transformers.team_events_to_grouped(next_events)},
    }
    cache.set(key, result, settings.cache_ttl_team)
    return result


def player_bundle(player_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"player:{player_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    try:
        details_raw = client.get_json(f"/player/{player_id}")
    except SofaScoreError:
        details_raw = None
    if not details_raw:
        return None

    career_raw = _safe(lambda: client.get_json(f"/player/{player_id}/statistics/seasons"))

    result = {
        "details": transformers.player_details(details_raw),
        "career": {"DATA": (career_raw or {}).get("uniqueTournamentSeasons") or []},
    }
    cache.set(key, result, settings.cache_ttl_player)
    return result


def team_results(team_id: int, page: int = 0) -> dict[str, Any]:
    settings = get_settings()
    key = f"team-results:{team_id}:{page}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/team/{team_id}/events/last/{page}")
    events = (payload or {}).get("events") or []
    result = {"DATA": transformers.team_events_to_grouped(events), "count": len(events)}
    cache.set(key, result, settings.cache_ttl_matches)
    return result


def team_fixtures(team_id: int, page: int = 0) -> dict[str, Any]:
    settings = get_settings()
    key = f"team-fixtures:{team_id}:{page}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/team/{team_id}/events/next/{page}")
    events = (payload or {}).get("events") or []
    result = {"DATA": transformers.team_events_to_grouped(events), "count": len(events)}
    cache.set(key, result, settings.cache_ttl_matches)
    return result


def tournament_details(tournament_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"tournament:{tournament_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(f"/unique-tournament/{tournament_id}")
    if not raw:
        return None
    result = transformers.tournament_details(raw)
    cache.set(key, result, settings.cache_ttl_team)
    return result


def tournament_seasons(tournament_id: int) -> dict[str, Any] | None:
    settings = get_settings()
    key = f"tournament-seasons:{tournament_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(f"/unique-tournament/{tournament_id}/seasons")
    if not raw:
        return None
    result = {"DATA": (raw or {}).get("seasons") or []}
    cache.set(key, result, settings.cache_ttl_team)
    return result


def _resolve_current_season(tournament_id: int) -> int | None:
    """Picks the most recent season id for a tournament (cached)."""
    settings = get_settings()
    key = f"tournament-current-season:{tournament_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    client = get_client()
    raw = client.get_json(f"/unique-tournament/{tournament_id}/seasons")
    seasons = (raw or {}).get("seasons") or []
    if not seasons:
        return None
    # SofaScore lists most recent first.
    current = seasons[0]
    season_id = current.get("id")
    if isinstance(season_id, int):
        cache.set(key, season_id, settings.cache_ttl_team)
    return season_id


def tournament_standings(tournament_id: int, season_id: int | None) -> dict[str, Any] | None:
    settings = get_settings()
    resolved_season = season_id or _resolve_current_season(tournament_id)
    if not resolved_season:
        return None

    key = f"tournament-standings:{tournament_id}:{resolved_season}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(
        f"/unique-tournament/{tournament_id}/season/{resolved_season}/standings/total"
    )
    if not raw:
        return None
    result = transformers.tournament_standings(raw)
    cache.set(key, result, settings.cache_ttl_details * 4)  # standings change less often than scores
    return result


def tournament_matches(
    tournament_id: int,
    season_id: int | None,
    page: int = 0,
) -> dict[str, Any] | None:
    settings = get_settings()
    resolved_season = season_id or _resolve_current_season(tournament_id)
    if not resolved_season:
        return None

    key = f"tournament-matches:{tournament_id}:{resolved_season}:{page}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    # SofaScore exposes both last and next events. We pull next first (fixtures),
    # then last (results). The route exposes them under separate keys.
    fixtures_raw = _safe(lambda: client.get_json(
        f"/unique-tournament/{tournament_id}/season/{resolved_season}/events/next/{page}"
    ))
    results_raw = _safe(lambda: client.get_json(
        f"/unique-tournament/{tournament_id}/season/{resolved_season}/events/last/{page}"
    ))
    fixtures_events = (fixtures_raw or {}).get("events") or []
    results_events = (results_raw or {}).get("events") or []
    payload = {
        "fixtures": {"DATA": transformers.team_events_to_grouped(fixtures_events)},
        "results": {"DATA": transformers.team_events_to_grouped(results_events)},
        "season_id": resolved_season,
    }
    cache.set(key, payload, settings.cache_ttl_matches)
    return payload


def tournament_top_scorers(tournament_id: int, season_id: int | None) -> dict[str, Any] | None:
    settings = get_settings()
    resolved_season = season_id or _resolve_current_season(tournament_id)
    if not resolved_season:
        return None

    key = f"tournament-top-scorers:{tournament_id}:{resolved_season}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(
        f"/unique-tournament/{tournament_id}/season/{resolved_season}/top-players/overall"
    )
    if not raw:
        return None
    result = {"DATA": raw, "season_id": resolved_season}
    cache.set(key, result, settings.cache_ttl_team)
    return result


def search(query: str) -> dict[str, Any] | None:
    settings = get_settings()
    q = (query or "").strip()
    if not q:
        return None
    key = f"search:{q.lower()}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(f"/search/all?q={q}")
    if raw is None:
        return None
    result = transformers.search_results(raw)
    cache.set(key, result, settings.cache_ttl_matches)
    return result


def lanus_shotmap_df(match_url: str) -> list[dict[str, Any]] | None:
    """Optional: returns LanusStats shotmap as JSON list. Falls back to None if
    LanusStats isn't available or the call fails."""
    if _lanus is None:
        return None
    try:
        df = _lanus.get_match_shotmap(match_url)
        if df is None:
            return None
        return df.to_dict(orient="records")
    except Exception as exc:
        logger.info("LanusStats shotmap failed url=%s err=%s", match_url, exc)
        return None


def _safe(fn):
    try:
        return fn()
    except SofaScoreError as exc:
        logger.info("SofaScore sub-fetch failed: %s", exc)
        return None
    except Exception as exc:  # noqa: BLE001 — never let aux fetch break the bundle
        logger.warning("Unexpected sub-fetch failure: %s", exc)
        return None
