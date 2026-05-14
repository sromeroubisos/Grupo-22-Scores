from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import sofascore_service

router = APIRouter(prefix="/v1/teams", tags=["teams"])


def _normalize_team_id(raw: str) -> int:
    raw = raw.strip()
    if raw.startswith("ss-team-"):
        raw = raw[len("ss-team-"):]
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="team_id must be numeric (SofaScore id)")
    return int(raw)


@router.get("/{team_id}")
def get_team(team_id: str) -> Any:
    sid = _normalize_team_id(team_id)
    bundle = sofascore_service.team_bundle(sid)
    if bundle is None:
        raise HTTPException(status_code=404, detail="team not found")
    return bundle


@router.get("/{team_id}/results")
def get_team_results(team_id: str, page: int = Query(0, ge=0, le=20)) -> Any:
    sid = _normalize_team_id(team_id)
    return sofascore_service.team_results(sid, page)


@router.get("/{team_id}/fixtures")
def get_team_fixtures(team_id: str, page: int = Query(0, ge=0, le=20)) -> Any:
    sid = _normalize_team_id(team_id)
    return sofascore_service.team_fixtures(sid, page)
