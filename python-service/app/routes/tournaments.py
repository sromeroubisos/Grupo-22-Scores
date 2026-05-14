from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import sofascore_service

router = APIRouter(prefix="/v1/tournaments", tags=["tournaments"])


def _normalize_tournament_id(raw: str) -> int:
    raw = raw.strip()
    if raw.startswith("ss-tour-"):
        raw = raw[len("ss-tour-"):]
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="tournament_id must be numeric (SofaScore id)")
    return int(raw)


def _coerce_season(raw: str | None) -> int | None:
    if raw is None or raw == "":
        return None
    if raw.startswith("ss-season-"):
        raw = raw[len("ss-season-"):]
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="season must be numeric")
    return int(raw)


@router.get("/{tournament_id}")
def get_tournament(tournament_id: str) -> Any:
    tid = _normalize_tournament_id(tournament_id)
    payload = sofascore_service.tournament_details(tid)
    if payload is None:
        raise HTTPException(status_code=404, detail="tournament not found")
    return payload


@router.get("/{tournament_id}/seasons")
def list_tournament_seasons(tournament_id: str) -> Any:
    tid = _normalize_tournament_id(tournament_id)
    payload = sofascore_service.tournament_seasons(tid)
    if payload is None:
        raise HTTPException(status_code=404, detail="seasons not available")
    return payload


@router.get("/{tournament_id}/standings")
def get_tournament_standings(
    tournament_id: str,
    season: str | None = Query(None),
) -> Any:
    tid = _normalize_tournament_id(tournament_id)
    season_id = _coerce_season(season)
    payload = sofascore_service.tournament_standings(tid, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="standings not available")
    return payload


@router.get("/{tournament_id}/matches")
def get_tournament_matches(
    tournament_id: str,
    season: str | None = Query(None),
    page: int = Query(0, ge=0, le=20),
) -> Any:
    tid = _normalize_tournament_id(tournament_id)
    season_id = _coerce_season(season)
    payload = sofascore_service.tournament_matches(tid, season_id, page)
    if payload is None:
        raise HTTPException(status_code=404, detail="matches not available")
    return payload


@router.get("/{tournament_id}/top-scorers")
def get_tournament_top_scorers(
    tournament_id: str,
    season: str | None = Query(None),
) -> Any:
    tid = _normalize_tournament_id(tournament_id)
    season_id = _coerce_season(season)
    payload = sofascore_service.tournament_top_scorers(tid, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="top scorers not available")
    return payload
