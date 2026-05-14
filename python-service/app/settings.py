import os
from functools import lru_cache
from dataclasses import dataclass


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    service_token: str | None
    sofascore_base_url: str
    sofascore_timeout: int
    cache_ttl_matches: int
    cache_ttl_live: int
    cache_ttl_details: int
    cache_ttl_team: int
    cache_ttl_player: int
    log_level: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        host=os.getenv("HOST", "0.0.0.0"),
        port=_int_env("PORT", 8000),
        service_token=os.getenv("SERVICE_TOKEN") or None,
        sofascore_base_url=os.getenv("SOFASCORE_BASE_URL", "https://api.sofascore.com/api/v1").rstrip("/"),
        sofascore_timeout=_int_env("SOFASCORE_TIMEOUT", 15),
        cache_ttl_matches=_int_env("CACHE_TTL_MATCHES", 60),
        cache_ttl_live=_int_env("CACHE_TTL_LIVE", 5),
        cache_ttl_details=_int_env("CACHE_TTL_DETAILS", 30),
        cache_ttl_team=_int_env("CACHE_TTL_TEAM", 3600),
        cache_ttl_player=_int_env("CACHE_TTL_PLAYER", 3600),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )
