import logging
import os

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import matches, players, search, teams, tournaments
from app.settings import get_settings
from app.sofascore_http import SofaScoreError

settings = get_settings()

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("sofascore-bridge")


def _enforce_service_token() -> None:
    """B4: without SERVICE_TOKEN every endpoint is publicly reachable.

    In production, refuse to start. In dev, keep the current behaviour but log
    a loud warning at startup.
    """
    if settings.service_token:
        return
    env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if env in {"production", "prod"}:
        raise RuntimeError(
            "SERVICE_TOKEN is not set — refusing to start in production: "
            "all endpoints would be publicly accessible without authentication. "
            "Set SERVICE_TOKEN and restart."
        )
    logger.warning(
        "%s\nSERVICE_TOKEN is NOT set — all endpoints are UNAUTHENTICATED. "
        "This is only acceptable in local development. Set SERVICE_TOKEN before deploying.\n%s",
        "=" * 72,
        "=" * 72,
    )


def create_app() -> FastAPI:
    _enforce_service_token()

    app = FastAPI(title="SofaScore Bridge", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        if request.url.path in {"/health", "/openapi.json", "/docs", "/redoc"}:
            return await call_next(request)
        token = settings.service_token
        if token:
            provided = request.headers.get("x-service-token")
            if provided != token:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "invalid service token"},
                )
        return await call_next(request)

    @app.exception_handler(SofaScoreError)
    async def sofa_error_handler(_request: Request, exc: SofaScoreError):
        upstream = exc.status or 502
        return JSONResponse(
            status_code=502,
            content={"detail": "upstream error", "upstream_status": upstream, "message": str(exc)},
        )

    @app.get("/health")
    def health():
        return {"ok": True, "service": "sofascore-bridge"}

    app.include_router(matches.router)
    app.include_router(teams.router)
    app.include_router(players.router)
    app.include_router(tournaments.router)
    app.include_router(search.router)

    return app


app = create_app()
