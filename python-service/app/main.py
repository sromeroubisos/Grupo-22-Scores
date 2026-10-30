import hmac
import logging
import os

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import matches, players, search, teams, tennis, tournaments
from app.settings import get_settings
from app.sofascore_http import SofaScoreError

settings = get_settings()

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("sofascore-bridge")


def _runtime_env() -> str:
    return (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()


def _is_dev() -> bool:
    """Dev solo si se declara a proposito. Sin ENV no es dev: falla cerrado."""
    return _runtime_env() in {"dev", "development", "local"}


def _cors_origins() -> list[str]:
    """Origenes permitidos para CORS, por env (CORS_ALLOW_ORIGINS, separados por
    coma). Por defecto ninguno: el que llama es el servidor de Next, no un
    navegador, y CORS no aplica de servidor a servidor. Nunca "*"."""
    raw = os.getenv("CORS_ALLOW_ORIGINS") or ""
    return [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]


def _enforce_service_token() -> None:
    """B4: without SERVICE_TOKEN every endpoint is publicly reachable.

    Falla cerrado: sin SERVICE_TOKEN el servicio no arranca, salvo ENV=dev
    explicito. Antes solo se negaba con ENV=production, asi que un deploy que se
    olvidara de ENV quedaba abierto.
    """
    if settings.service_token:
        return
    if not _is_dev():
        raise RuntimeError(
            "SERVICE_TOKEN is not set — refusing to start: "
            "all endpoints would be publicly accessible without authentication. "
            "Set SERVICE_TOKEN (or ENV=dev for local development) and restart."
        )
    logger.warning(
        "%s\nSERVICE_TOKEN is NOT set — all endpoints are UNAUTHENTICATED. "
        "This is only acceptable in local development. Set SERVICE_TOKEN before deploying.\n%s",
        "=" * 72,
        "=" * 72,
    )


def create_app() -> FastAPI:
    _enforce_service_token()

    # La documentacion interactiva describe cada endpoint: solo en dev. En
    # produccion /docs, /redoc y /openapi.json no existen (404).
    dev = _is_dev()
    app = FastAPI(
        title="SofaScore Bridge",
        version="0.1.0",
        docs_url="/docs" if dev else None,
        redoc_url="/redoc" if dev else None,
        openapi_url="/openapi.json" if dev else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_methods=["GET"],
        allow_headers=["x-service-token", "content-type"],
    )

    public_paths = {"/health"} | ({"/openapi.json", "/docs", "/redoc"} if dev else set())

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        if request.url.path in public_paths:
            return await call_next(request)
        token = settings.service_token
        if token:
            provided = request.headers.get("x-service-token") or ""
            # compare_digest: el tiempo de la comparacion no filtra cuantos
            # caracteres del token acerto quien prueba.
            if not hmac.compare_digest(provided.encode("utf-8"), token.encode("utf-8")):
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
    app.include_router(tennis.router)

    return app


app = create_app()
