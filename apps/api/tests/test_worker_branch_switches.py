from __future__ import annotations

import pytest

from apps.worker.worker import config as worker_config
from apps.worker.worker import main as worker_main


BRANCH_ENV_KEYS = (
    "WORKER_ENABLE_COMIC_TASK",
    "WORKER_ENABLE_COMIC_ORCHESTRATION",
)


def clear_worker_settings_cache() -> None:
    worker_config.get_settings.cache_clear()


def test_worker_branches_default_to_python_image_jobs_disabled(monkeypatch) -> None:
    for env_key in BRANCH_ENV_KEYS:
        monkeypatch.delenv(env_key, raising=False)
    clear_worker_settings_cache()

    branch_names = [branch.name for branch in worker_main.build_worker_branches()]

    assert branch_names == ["comic-task", "comic-orchestration"]


def test_worker_branches_ignore_removed_image_jobs_flag(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_ENABLE_IMAGE_JOBS", "true")
    clear_worker_settings_cache()

    branch_names = [branch.name for branch in worker_main.build_worker_branches()]

    assert branch_names == ["comic-task", "comic-orchestration"]
    assert not hasattr(worker_main, "run_image_jobs_branch_once")


def test_worker_branches_reject_all_disabled(monkeypatch) -> None:
    for env_key in BRANCH_ENV_KEYS:
        monkeypatch.setenv(env_key, "false")
    clear_worker_settings_cache()

    with pytest.raises(RuntimeError, match="No worker branches are enabled"):
        worker_main.build_worker_branches()


def test_worker_run_once_obeys_disabled_image_jobs(monkeypatch) -> None:
    calls: list[str] = []

    def process_comic_task() -> None:
        calls.append("comic-task")
        return None

    def process_comic_orchestration() -> None:
        calls.append("comic-orchestration")
        return None

    monkeypatch.setenv("WORKER_ENABLE_IMAGE_JOBS", "true")
    clear_worker_settings_cache()
    monkeypatch.setattr(worker_main, "run_next_comic_task", process_comic_task)
    monkeypatch.setattr(worker_main, "run_next_comic_orchestration", process_comic_orchestration)

    message = worker_main.run_once()

    assert sorted(calls) == ["comic-orchestration", "comic-task"]
    assert message == "No claimable comic tasks."


def test_bootstrap_message_lists_enabled_branches(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_ENABLE_IMAGE_JOBS", "true")
    clear_worker_settings_cache()

    message = worker_main.build_bootstrap_message()

    assert "enabled branches: comic-task, comic-orchestration" in message
    assert "image-jobs" not in message
