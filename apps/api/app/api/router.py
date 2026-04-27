from fastapi import APIRouter

from apps.api.app.api.health import router as health_router
from apps.api.app.core.module_loader import load_optional_attribute

PUBLIC_DOMAIN_ROUTERS = (
    "apps.api.app.domains.auth.routes",
    "apps.api.app.domains.billing.routes",
    "apps.api.app.domains.redeem.routes",
    "apps.api.app.domains.llm.routes",
    "apps.api.app.domains.image.routes",
    "apps.api.app.domains.comic.router",
    "apps.api.app.domains.settings.routes",
    "apps.api.app.domains.public_quota.routes",
)

ADMIN_DOMAIN_ROUTERS = (
    "apps.api.app.domains.auth.routes",
    "apps.api.app.domains.billing.routes",
    "apps.api.app.domains.redeem.routes",
    "apps.api.app.domains.llm.routes",
    "apps.api.app.domains.image.routes",
    "apps.api.app.domains.comic.router",
    "apps.api.app.domains.settings.routes",
    "apps.api.app.domains.ops.routes",
)


def include_domain_routers(parent: APIRouter, module_paths: tuple[str, ...], attribute_name: str) -> None:
    for module_path in module_paths:
        router = load_optional_attribute(module_path, attribute_name)
        if router is not None:
            parent.include_router(router)


def build_api_router() -> APIRouter:
    router = APIRouter()
    public_router = APIRouter(prefix="/api/public", tags=["public"])
    admin_router = APIRouter(prefix="/api/admin", tags=["admin"])
    router.include_router(health_router)
    include_domain_routers(public_router, PUBLIC_DOMAIN_ROUTERS, "public_router")
    include_domain_routers(admin_router, ADMIN_DOMAIN_ROUTERS, "admin_router")
    router.include_router(public_router)
    router.include_router(admin_router)
    return router
