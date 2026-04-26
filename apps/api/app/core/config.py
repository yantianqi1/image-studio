from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    app_env: str = "development"
    app_version: str = "0.1.0"
    service_name: str = "api"
    database_url: str = "sqlite:///./commercial_studio.db"
    user_session_cookie_name: str = "studio_user_session"
    admin_session_cookie_name: str = "studio_admin_session"
    admin_session_max_age_seconds: int = 2592000
    session_secret: str = "replace-me"
    signup_bonus_cents: int = 100
    activation_code_length: int = 32
    generated_assets_dir: str = "./generated-assets"
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
    openai_chat_model_member_price_cents: int = 12
    openai_chat_model_anonymous_price_cents: int = 0
    openai_image_model_code: str = "gpt-image-2"
    openai_image_model_display_name: str = "GPT Image 2"
    openai_image_model_provider_model: str = "gpt-image-2"
    openai_image_model_member_price_cents: int = 77
    openai_image_model_anonymous_price_cents: int = 0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
