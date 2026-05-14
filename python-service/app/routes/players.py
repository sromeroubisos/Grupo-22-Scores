from typing import Any

from fastapi import APIRouter, HTTPException

from app import sofascore_service

router = APIRouter(prefix="/v1/players", tags=["players"])


def _normalize_player_id(raw: str) -> int:
    raw = raw.strip()
    if raw.startswith("ss-player-"):
        raw = raw[len("ss-player-"):]
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="player_id must be numeric (SofaScore id)")
    return int(raw)


@router.get("/{player_id}")
def get_player(player_id: str) -> Any:
    sid = _normalize_player_id(player_id)
    bundle = sofascore_service.player_bundle(sid)
    if bundle is None:
        raise HTTPException(status_code=404, detail="player not found")
    return bundle
