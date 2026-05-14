import re
from datetime import date as _date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import sofascore_service

router = APIRouter(prefix="/v1/matches", tags=["matches"])

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _normalize_match_id(raw: str) -> int:
    raw = raw.strip()
    if raw.startswith("ss-match-"):
        raw = raw[len("ss-match-"):]
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="match_id must be numeric")
    return int(raw)


@router.get("")
def list_matches(
    date: str = Query(..., description="YYYY-MM-DD, in the requested timezone"),
    tz: str | None = Query(None, description="IANA timezone name (informational)"),
) -> Any:
    _ = tz  # SofaScore endpoints take a date directly; tz is used by the caller
    if not ISO_DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    try:
        _date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date")
    return sofascore_service.matches_by_date(date)


@router.get("/live")
def list_live() -> Any:
    return sofascore_service.live_matches()


@router.get("/{match_id}")
def get_match(match_id: str) -> Any:
    sid = _normalize_match_id(match_id)
    details = sofascore_service.match_details(sid)
    if details is None:
        raise HTTPException(status_code=404, detail="match not found")
    return details


@router.get("/{match_id}/lineups")
def get_match_lineups(match_id: str) -> Any:
    sid = _normalize_match_id(match_id)
    payload = sofascore_service.match_lineups(sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="lineups not available")
    return payload


@router.get("/{match_id}/statistics")
def get_match_stats(match_id: str) -> Any:
    sid = _normalize_match_id(match_id)
    payload = sofascore_service.match_statistics(sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="statistics not available")
    return payload


@router.get("/{match_id}/shotmap")
def get_match_shotmap(match_id: str) -> Any:
    sid = _normalize_match_id(match_id)
    payload = sofascore_service.match_shotmap(sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="shotmap not available")
    return payload


@router.get("/{match_id}/h2h")
def get_match_h2h(match_id: str) -> Any:
    sid = _normalize_match_id(match_id)
    payload = sofascore_service.match_h2h(sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="h2h not available")
    return payload
