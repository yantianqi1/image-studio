from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    app_env: str = "development"
    worker_name: str = "commercial-studio-worker"
    worker_poll_interval_seconds: float = 1.0
    worker_stale_running_job_seconds: int = 300
    worker_stale_job_alert_threshold: int = 1

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> WorkerSettings:
    return WorkerSettings()
