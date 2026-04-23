from fastapi import APIRouter

from apps.api.app.core.config import get_settings
from apps.api.app.core.response import api_ok

router = APIRouter()


def build_health_payload() -> dict[str, str]:
    settings = get_settings()
    return {
        "environment": settings.app_env,
        "service": settings.service_name,
        "status": "ok",
        "version": settings.app_version,
    }


@router.get("/health")
def health_check() -> dict[str, object]:
    return api_ok(build_health_payload())


@router.get("/ready")
def readiness_check() -> dict[str, object]:
    return api_ok(build_health_payload())

