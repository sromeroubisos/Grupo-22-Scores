from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import sofascore_service

router = APIRouter(prefix="/v1/search", tags=["search"])


@router.get("")
def search(q: str = Query(..., min_length=1, max_length=128)) -> Any:
    payload = sofascore_service.search(q)
    if payload is None:
        raise HTTPException(status_code=404, detail="no results")
    return payload
