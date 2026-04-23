from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from apps.api.app.api.health import router as health_router
from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_error


def create_app() -> FastAPI:
    app = FastAPI(title="commercial-studio-api", version="0.1.0")
    app.include_router(health_router)

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=api_error(code=exc.code, message=exc.message),
        )

    return app


app = create_app()
