from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_ANONYMOUS_SESSION_COOKIE_NAME = "studio_anonymous_session"
DEFAULT_ANONYMOUS_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60


class AppSettings(BaseSettings):
    app_env: str = "development"
    app_version: str = "0.1.0"
    service_name: str = "api"
    database_url: str = "sqlite:///./commercial_studio.db"
    user_session_cookie_name: str = "studio_user_session"
    anonymous_session_cookie_name: str = DEFAULT_ANONYMOUS_SESSION_COOKIE_NAME
    anonymous_session_cookie_secure: bool = False
    anonymous_session_max_age_seconds: int = DEFAULT_ANONYMOUS_SESSION_MAX_AGE_SECONDS
    admin_session_cookie_name: str = "studio_admin_session"
    admin_session_cookie_secure: bool = False
    admin_session_max_age_seconds: int = 2592000
    session_secret: str = "replace-me"
    generated_assets_dir: str = "./generated-assets"
    asset_storage_backend: str = "local"
    asset_storage_gcs_bucket: str = ""
    asset_storage_gcs_prefix: str = "generated-assets"
    chat_image_timeout_seconds: float = 180.0
    chat_image_download_timeout_seconds: float = 60.0
    default_admin_username: str = ""
    default_admin_password: str = ""
    openai_provider_name: str = "wdapi"
    openai_provider_type: str = "openai-chat-compatible"
    openai_provider_base_url: str = "https://ws.wdapi.top/v1"
    openai_provider_api_key_env: str = "OPENAI_PROVIDER_KEY"
    openai_provider_default_model: str = "gemini-3-flash-preview-low"
    openai_chat_model_code: str = "gemini-3-flash-preview-low"
    openai_chat_model_display_name: str = "Gemini 3 Flash Preview Low"
    openai_chat_model_provider_model: str = "gemini-3-flash-preview-low"
    image_job_title_model_code: str = ""
    openai_image_model_code: str = "gpt-image-2"
    openai_image_model_display_name: str = "GPT Image 2"
    openai_image_model_provider_model: str = "gpt-image-2"
    openai_official_provider_name: str = "openai-official"
    openai_official_provider_type: str = "openai-compatible"
    openai_official_provider_base_url: str = "https://api.openai.com/v1"
    openai_official_provider_api_key_env: str = "OPENAI_OFFICIAL_API_KEY"
    openai_official_provider_default_model: str = "gpt-image-2"
    openai_official_image_model_code: str = "gpt-image-2-official"
    openai_official_image_model_display_name: str = "GPT Image 2 官方通道"
    openai_official_image_model_provider_model: str = "gpt-image-2"
    openrouter_provider_name: str = "openrouter"
    openrouter_provider_type: str = "openrouter-chat-image"
    openrouter_provider_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_provider_api_key_env: str = "OPENROUTER_API_KEY"
    openrouter_provider_default_model: str = "openai/gpt-5.4-image-2"
    openrouter_image_model_code: str = "gpt-image-2-openrouter"
    openrouter_image_model_display_name: str = "GPT Image 2 OpenRouter"
    openrouter_image_model_provider_model: str = "openai/gpt-5.4-image-2"
    newapi_base_url: str = "https://newapi.example/v1"
    newapi_api_key_env: str = "NEWAPI_API_KEY"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
