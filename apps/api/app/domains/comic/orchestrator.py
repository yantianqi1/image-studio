from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.comic.character_references import (
    approve_character_references,
    sync_completed_character_references,
)
from apps.api.app.domains.comic.constants import TASK_STATUS_COMPLETED
from apps.api.app.domains.comic.image_generation import approve_task_image_generation, list_ready_panel_prompts
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicPanelPrompt, ComicTask
from apps.api.app.domains.comic.repository import list_character_cards, mark_task_failed
from apps.api.app.domains.image.models import ImageJob

COMIC_REFERENCE_IMAGE_FAILED_CODE = "comic_reference_image_failed"
COMIC_PAGE_IMAGE_FAILED_CODE = "comic_page_image_failed"


def run_next_comic_orchestration_step(session: Session) -> str | None:
    for task in list_completed_tasks(session):
        action = continue_completed_task(session, task=task)
        if action is not None:
            return f"{action}:{task.id}"
    return None


def list_completed_tasks(session: Session) -> list[ComicTask]:
    statement = select(ComicTask).where(ComicTask.status == TASK_STATUS_COMPLETED)
    return list(session.execute(statement.order_by(ComicTask.finished_at.asc(), ComicTask.created_at.asc())).scalars())


def continue_completed_task(session: Session, *, task: ComicTask) -> str | None:
    cards = list_character_cards(session, task_id=task.id)
    prompts = list_ready_panel_prompts(session, task_id=task.id)
    if not cards or not prompts:
        return None
    failed_action = fail_on_terminal_image_errors(session, task=task, cards=cards, prompts=prompts)
    if failed_action is not None:
        return failed_action
    if missing_reference_jobs(cards):
        approve_character_references(session, task.id)
        return "queued-character-references"
    reference_payload = sync_completed_character_references(session, task.id)
    if not reference_payload["ready"]:
        return None
    if missing_page_jobs(prompts):
        approve_task_image_generation(session, task.id)
        return "queued-page-images"
    return None


def fail_on_terminal_image_errors(
    session: Session,
    *,
    task: ComicTask,
    cards: list[ComicCharacterCard],
    prompts: list[ComicPanelPrompt],
) -> str | None:
    reference_error = first_failed_reference_error(session, cards=cards)
    if reference_error is not None:
        mark_task_failed(session, task=task, error_code=COMIC_REFERENCE_IMAGE_FAILED_CODE, error_message=reference_error)
        session.commit()
        return "failed-character-reference"
    page_error = first_failed_page_error(session, prompts=prompts)
    if page_error is None:
        return None
    mark_task_failed(session, task=task, error_code=COMIC_PAGE_IMAGE_FAILED_CODE, error_message=page_error)
    session.commit()
    return "failed-page-image"


def first_failed_reference_error(session: Session, *, cards: list[ComicCharacterCard]) -> str | None:
    for card in cards:
        if card.reference_image_job_id is None:
            continue
        job = session.get(ImageJob, card.reference_image_job_id)
        if job is None:
            return f"character reference image job missing: {card.reference_image_job_id}"
        if job.status == "failed":
            return job.error_message or f"character reference image failed: {card.character_code}"
    return None


def first_failed_page_error(session: Session, *, prompts: list[ComicPanelPrompt]) -> str | None:
    for prompt in prompts:
        if prompt.image_job_id is None:
            continue
        job = session.get(ImageJob, prompt.image_job_id)
        if job is None:
            return f"comic page image job missing: {prompt.image_job_id}"
        if job.status == "failed":
            return job.error_message or f"comic page image failed: {prompt.image_index}"
    return None


def missing_reference_jobs(cards: list[ComicCharacterCard]) -> bool:
    return any(card.reference_image_job_id is None and card.reference_asset_id is None for card in cards)


def missing_page_jobs(prompts: list[ComicPanelPrompt]) -> bool:
    return any(prompt.image_job_id is None for prompt in prompts)
