from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.models import ComicTask
from apps.api.app.domains.comic.pipeline import run_comic_pipeline
from apps.api.app.domains.comic.repository import mark_task_completed, mark_task_failed
from apps.api.app.domains.comic.services import require_task

logger = logging.getLogger(__name__)

COMIC_TASK_FAILED_ERROR_CODE = "comic_task_failed"
LOCAL_TEST_APP_ENV = "test"


def process_task(session: Session, task_id: str) -> ComicTask:
    task = require_task(session, task_id)
    try:
        if is_local_test_pipeline_enabled():
            mark_task_completed(session, task=task, output_payload=build_local_test_output(task=task))
        else:
            run_comic_pipeline(session, task=task)
    except AppError as exc:
        logger.exception("comic task %s failed: %s", task_id, exc.message)
        mark_task_failed(session, task=task, error_code=exc.code, error_message=exc.message)
    except Exception as exc:
        logger.exception("comic task %s failed", task_id)
        mark_task_failed(session, task=task, error_code=COMIC_TASK_FAILED_ERROR_CODE, error_message=str(exc))
    session.flush()
    return require_task(session, task.id)


def is_local_test_pipeline_enabled() -> bool:
    return get_settings().app_env == LOCAL_TEST_APP_ENV


def build_local_test_output(*, task: ComicTask) -> dict:
    return {
        "task_id": task.id,
        "task_type": task.task_type,
        "project_id": task.project_id,
        "chapter_id": task.chapter_id,
        "scene_id": task.scene_id,
        "input_payload": dict(task.input_payload),
        "local_test_output_not_llm": True,
    }
