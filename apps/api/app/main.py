from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from apps.api.app.api.router import build_api_router
from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_error
from apps.api.app.domains.auth.service import ensure_default_admin
from apps.api.app.domains.llm.catalog import ensure_provider_catalog
from apps.api.app.infra.db.session import initialize_database
from apps.api.app.infra.db.session import session_scope


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        initialize_database()
        with session_scope() as session:
            ensure_default_admin(session)
            ensure_provider_catalog(session)
        yield

    app = FastAPI(title="commercial-studio-api", version=settings.app_version, lifespan=lifespan)
    app.include_router(build_api_router())

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        if request.url.path.startswith("/api/admin") and exc.status_code == 401:
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        return JSONResponse(
            status_code=exc.status_code,
            content=api_error(code=exc.code, message=exc.message),
        )
    return app


app = create_app()
