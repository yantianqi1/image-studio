from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    app_env: str = "development"
    worker_name: str = "commercial-studio-worker"
    worker_poll_interval_seconds: float = 1.0
    worker_stale_running_job_seconds: int = 300
    worker_stale_job_alert_threshold: int = 1
    worker_image_job_concurrency: int = 2
    worker_enable_comic_task: bool = True
    worker_enable_comic_orchestration: bool = True
    worker_enable_image_jobs: bool = False

    @field_validator("worker_image_job_concurrency")
    @classmethod
    def validate_worker_image_job_concurrency(cls, value: int) -> int:
        if value < 1:
            raise ValueError("WORKER_IMAGE_JOB_CONCURRENCY must be at least 1")
        return value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> WorkerSettings:
    return WorkerSettings()
