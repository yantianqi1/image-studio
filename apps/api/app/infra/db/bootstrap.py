from apps.api.app.core.module_loader import load_optional_attribute

DOMAIN_MODEL_MODULES = (
    "apps.api.app.domains.auth.models",
    "apps.api.app.domains.billing.models",
    "apps.api.app.domains.redeem.models",
    "apps.api.app.domains.llm.models",
    "apps.api.app.domains.image.models",
    "apps.api.app.domains.comic.models",
    "apps.api.app.domains.settings.models",
)


def import_domain_models() -> None:
    for module_path in DOMAIN_MODEL_MODULES:
        load_optional_attribute(module_path, "__name__")
