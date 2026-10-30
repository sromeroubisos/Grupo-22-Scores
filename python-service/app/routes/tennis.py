import re
from datetime import date as _date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import sofascore_service

router = APIRouter(prefix="/v1/tennis", tags=["tennis"])

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _normalize_id(raw: str, prefix: str, label: str) -> int:
    raw = raw.strip()
    if raw.startswith(prefix):
        raw = raw[len(prefix):]
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail=f"{label} must be numeric")
    return int(raw)


def _parse_date(value: str) -> str:
    if not ISO_DATE_RE.match(value):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    try:
        _date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date")
    return value


def _parse_categories(raw: str | None) -> tuple[str, ...] | None:
    """`None` keeps the default tours; `all` opens it to every one of them."""
    if raw is None:
        return None
    if raw.strip().lower() == "all":
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())


@router.get("/matches")
def list_matches(
    date: str = Query(..., description="YYYY-MM-DD, in the requested timezone"),
    tz: str = Query(
        "UTC",
        description=(
            "IANA timezone the date is expressed in (e.g. America/Argentina/"
            "Buenos_Aires). Upstream answers a window around the date, so this "
            "decides which matches count as that day. Unknown names fall back "
            "to UTC."
        ),
    ),
    categories: str | None = Query(
        None,
        description=(
            "Comma separated tours (ATP,WTA,Challenger,WTA 125). Defaults to the "
            "main tours; `all` walks every tournament of the day, which costs one "
            "upstream request per tournament — over a hundred on a full day."
        ),
    ),
) -> Any:
    return sofascore_service.tennis_matches_by_date(
        _parse_date(date), _parse_categories(categories), tz
    )


@router.get("/matches/live")
def list_live() -> Any:
    return sofascore_service.tennis_live_matches()


@router.get("/matches/{match_id}")
def get_match(match_id: str) -> Any:
    sid = _normalize_id(match_id, "ss-match-", "match_id")
    payload = sofascore_service.tennis_match_details(sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="match not found")
    return payload


@router.get("/rankings/{tour}")
def get_rankings(tour: str) -> Any:
    payload = sofascore_service.tennis_rankings(tour)
    if payload is None:
        raise HTTPException(status_code=404, detail="tour must be atp or wta")
    return payload


@router.get("/players/{player_id}/rankings")
def get_player_rankings(player_id: str) -> Any:
    sid = _normalize_id(player_id, "ss-team-", "player_id")
    payload = sofascore_service.tennis_player_rankings(sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="rankings not available")
    return payload


@router.get("/tournaments/{tournament_id}")
def get_tournament(
    tournament_id: str,
    season: int | None = Query(None, description="Season id; defaults to the current one"),
) -> Any:
    sid = _normalize_id(tournament_id, "ss-tour-", "tournament_id")
    payload = sofascore_service.tennis_tournament(sid, season)
    if payload is None:
        raise HTTPException(status_code=404, detail="tournament not found")
    return payload


@router.get("/tournaments/{tournament_id}/draw")
def get_draw(
    tournament_id: str,
    season: int | None = Query(None, description="Season id; defaults to the current one"),
) -> Any:
    sid = _normalize_id(tournament_id, "ss-tour-", "tournament_id")
    payload = sofascore_service.tennis_draw(sid, season)
    if payload is None:
        raise HTTPException(status_code=404, detail="draw not available")
    return payload
