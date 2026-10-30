"""High level service: raw SofaScore endpoints + LanusStats helpers.

Functions return data already shaped via app.transformers so the FastAPI
route handlers stay thin.

LanusStats `sofascore_request` is just a thin requests wrapper, but its
higher-level helpers (`get_match_shotmap`, `get_lineups`, etc.) operate on
SofaScore match URLs and return pandas DataFrames. We expose those for the
analytics endpoints; raw API calls cover the rest.
"""

import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
    # Sin quote, un `q` con `&`, `#` o `/` metia parametros (o un path) propios
    # en el pedido a SofaScore.
    raw = client.get_json(f"/search/all?q={quote(q, safe='')}")
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


# ---------------------------------------------------------------------------
# Tennis
#
# The sport-wide `/sport/{sport}/scheduled-events/{date}` endpoint that serves
# football is gone for tennis: SofaScore now answers a day in two steps, first
# the tournaments playing that day, then the matches of each one. That is a
# fan-out, and in tennis it is a big one — a plain Sunday is 139 tournaments
# and 574 matches once ITF and UTR futures are counted. Restricting it to the
# tours anyone follows brings it down to 33 tournaments and 135 matches, so
# `categories` defaults to those and the caller widens it deliberately.
# ---------------------------------------------------------------------------

TENNIS_MAIN_CATEGORIES = ("ATP", "WTA", "Challenger", "WTA 125")

# One page of the tournament list is 100 entries; two cover a full day today.
_TENNIS_MAX_PAGES = 4


def _tennis_scheduled_tournaments(date_iso: str) -> list[dict[str, Any]]:
    """Every tournament with matches on `date_iso`, walking the pagination."""
    client = get_client()
    tournaments: list[dict[str, Any]] = []
    for page in range(1, _TENNIS_MAX_PAGES + 1):
        payload = _safe(lambda p=page: client.get_json(
            f"/sport/tennis/scheduled-tournaments/{date_iso}/page/{p}"
        ))
        entries = (payload or {}).get("scheduled") or []
        tournaments.extend(entries)
        if not (payload or {}).get("hasNextPage"):
            break
    return tournaments


def _local_date(timestamp: int | None, tz: ZoneInfo) -> str | None:
    if not timestamp:
        return None
    return datetime.fromtimestamp(timestamp, tz).date().isoformat()


def tennis_matches_by_date(
    date_iso: str,
    categories: tuple[str, ...] | None = None,
    tz_name: str = "UTC",
) -> dict[str, Any]:
    """A day of tennis, grouped per tournament like the football day view.

    `/unique-tournament/{id}/scheduled-events/{date}` answers with a window
    around the date, not the date: asking for a Sunday returned 533 matches of
    which only 239 were actually that Sunday, the rest split across the days
    either side. So the events are filtered here, in the timezone the caller
    asked for — a match at 22:00 in Buenos Aires belongs to a different day
    than the same match read from UTC.
    """
    settings = get_settings()
    wanted = tuple(categories) if categories is not None else TENNIS_MAIN_CATEGORIES
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        logger.info("Unknown timezone %s, falling back to UTC", tz_name)
        tz_name = "UTC"
        tz = ZoneInfo("UTC")
    key = f"tennis-matches:{date_iso}:{','.join(sorted(wanted)) or 'all'}:{tz_name}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    scheduled = _tennis_scheduled_tournaments(date_iso)
    events: list[dict[str, Any]] = []
    skipped: list[str] = []
    seen_tournaments: set[Any] = set()
    seen_events: set[Any] = set()
    fetched = 0
    for entry in scheduled:
        tournament = entry.get("tournament") or {}
        category = (tournament.get("category") or {}).get("name") or ""
        # An empty `wanted` means the caller asked for every tour on purpose.
        if wanted and category not in wanted:
            continue
        unique = tournament.get("uniqueTournament") or {}
        unique_id = unique.get("id") or tournament.get("id")
        if not unique_id:
            continue
        # La lista del día trae una entrada por torneo, y varias comparten el
        # mismo `uniqueTournament` (el cuadro principal y su clasificación).
        # Sin esto se pide dos veces y cada partido entra duplicado.
        if unique_id in seen_tournaments:
            continue
        seen_tournaments.add(unique_id)
        payload = _safe(lambda uid=unique_id: client.get_json(
            f"/unique-tournament/{uid}/scheduled-events/{date_iso}"
        ))
        if payload is None:
            skipped.append(tournament.get("name") or str(unique_id))
            continue
        fetched += 1
        # Cinturón además de tirantes: un mismo partido puede aparecer en la
        # respuesta de dos torneos distintos, y un id repetido rompe la lista.
        for event in payload.get("events") or []:
            event_id = event.get("id")
            if event_id in seen_events:
                continue
            seen_events.add(event_id)
            events.append(event)

    off_day = 0
    on_day: list[dict[str, Any]] = []
    for event in events:
        if _local_date(event.get("startTimestamp"), tz) == date_iso:
            on_day.append(event)
        else:
            off_day += 1

    grouped = transformers.group_tennis_by_tournament(on_day)
    result = {
        "DATA": grouped,
        "count": len(on_day),
        "tournaments_seen": len(scheduled),
        "tournaments_fetched": fetched,
        "discarded_off_day": off_day,
        "timezone": tz_name,
        "categories": list(wanted),
        # A tournament whose fetch failed is reported, never silently dropped:
        # a missing match looks identical to a match that was not played.
        "skipped": skipped,
    }
    cache.set(key, result, settings.cache_ttl_matches)
    return result


def tennis_live_matches() -> dict[str, Any]:
    settings = get_settings()
    key = "tennis-matches:live"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json("/sport/tennis/events/live")
    events = (payload or {}).get("events") or []
    grouped = transformers.group_tennis_by_tournament(events)
    result = {"DATA": grouped, "count": len(events)}
    cache.set(key, result, settings.cache_ttl_live)
    return result


def tennis_draw(tournament_id: int, season_id: int | None) -> dict[str, Any] | None:
    """The bracket. SofaScore calls it a cup tree and returns one per event
    (singles and doubles of the same Slam come as separate trees)."""
    settings = get_settings()
    resolved_season = season_id or _resolve_current_season(tournament_id)
    if not resolved_season:
        return None

    key = f"tennis-draw:{tournament_id}:{resolved_season}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(
        f"/unique-tournament/{tournament_id}/season/{resolved_season}/cuptrees"
    )
    if not raw:
        return None
    result = {"DATA": raw.get("cupTrees") or [], "season_id": resolved_season}
    cache.set(key, result, settings.cache_ttl_details * 4)
    return result


# SofaScore keys its ranking lists by number; 5 is the ATP singles list and
# 6 the WTA one. There is no slug endpoint to look these up from.
TENNIS_RANKING_TYPES = {"atp": 5, "wta": 6}


def tennis_rankings(tour: str) -> dict[str, Any] | None:
    settings = get_settings()
    ranking_type = TENNIS_RANKING_TYPES.get(tour.lower())
    if ranking_type is None:
        return None

    key = f"tennis-rankings:{tour.lower()}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(f"/rankings/type/{ranking_type}")
    if not raw:
        return None
    result = {
        "DATA": raw.get("rankings") or [],
        "tour": tour.lower(),
        "updated_at": raw.get("updatedAtTimestamp"),
    }
    cache.set(key, result, settings.cache_ttl_team)
    return result


def tennis_player_rankings(player_id: int) -> dict[str, Any] | None:
    """A player's ranking history. Tennis players are `team` in SofaScore, so
    the rest of a player's profile already comes from `team_bundle`."""
    settings = get_settings()
    key = f"tennis-player-rankings:{player_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(f"/team/{player_id}/rankings")
    if not raw:
        return None
    result = {"DATA": raw.get("rankings") or []}
    cache.set(key, result, settings.cache_ttl_team)
    return result


def tennis_match_details(match_id: int) -> dict[str, Any] | None:
    """Un partido de tenis con su planilla.

    Ruta propia y no `match_details`, que transforma con la forma de fútbol.
    Las estadísticas son opcionales: un partido que recién empieza no tiene, y
    eso no puede tumbar la ficha.
    """
    settings = get_settings()
    key = f"tennis-match:{match_id}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    payload = client.get_json(f"/event/{match_id}")
    if not payload:
        return None
    event = payload.get("event") or payload

    statistics = _safe(lambda: client.get_json(f"/event/{match_id}/statistics"))

    result = {
        "match": transformers.tennis_event(event),
        "statistics": (statistics or {}).get("statistics") or [],
    }
    cache.set(key, result, settings.cache_ttl_details)
    return result


def tennis_tournament(tournament_id: int, season_id: int | None = None) -> dict[str, Any] | None:
    """Un torneo de tenis: sus datos y su cuadro, en una sola respuesta.

    El cuadro es lo que hace de "tabla" en tenis, así que viene junto y no por
    una segunda ida y vuelta. Si el cuadro no está —un torneo que todavía no
    sorteó— los datos igual se devuelven: la ficha existe aunque el cuadro no.
    """
    settings = get_settings()
    key = f"tennis-tournament:{tournament_id}:{season_id or 'actual'}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    client = get_client()
    raw = client.get_json(f"/unique-tournament/{tournament_id}")
    if not raw:
        return None
    unique = raw.get("uniqueTournament") or raw
    category = unique.get("category") or {}

    draw = _safe(lambda: tennis_draw(tournament_id, season_id))

    result = {
        "tournament": {
            "id": transformers._prefix(transformers.SOFASCORE_TOURNAMENT_ID_PREFIX, unique.get("id")),
            "name": unique.get("name") or "",
            "tour": category.get("name"),
            "slug": unique.get("slug"),
            "logo": (
                f"https://api.sofascore.com/api/v1/unique-tournament/{unique.get('id')}/image"
                if unique.get("id") else None
            ),
            "country": (category.get("country") or {}).get("name"),
            "ground_type": unique.get("groundType"),
        },
        "draw": (draw or {}).get("DATA") or [],
        "season_id": (draw or {}).get("season_id"),
    }
    cache.set(key, result, settings.cache_ttl_details * 4)
    return result
