from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.models import ComicCharacterCard
from apps.api.app.domains.comic.repository import (
    list_character_cards,
    update_character_reference_asset,
    update_character_reference_job,
)
from apps.api.app.domains.comic.services import require_task
from apps.api.app.domains.image.service import create_job, get_job, list_job_results

COMIC_REFERENCES_NOT_READY_CODE = "comic_character_references_not_ready"


def approve_character_references(session: Session, task_id: str) -> dict:
    task = require_task(session, task_id)
    require_completed_task_status(task.status)
    cards = require_character_cards(session, task_id=task.id)
    created_count = 0
    reused_count = 0
    for card in cards:
        if card.reference_image_job_id is not None:
            reused_count += 1
            continue
        job = create_reference_job(session, card=card)
        update_character_reference_job(session, card=card, job_id=job.id)
        created_count += 1
    session.commit()
    return build_reference_payload(session, cards=cards, created_count=created_count, reused_count=reused_count)


def sync_completed_character_references(session: Session, task_id: str) -> dict:
    cards = require_character_cards(session, task_id=task_id)
    for card in cards:
        sync_card_reference_asset(session, card=card)
    session.commit()
    return build_reference_payload(session, cards=cards, created_count=0, reused_count=len(cards))


def list_character_references(session: Session, task_id: str) -> list[dict]:
    cards = require_character_cards(session, task_id=task_id)
    return [character_reference_payload(session, card=card) for card in cards]


def require_completed_task_status(status: str) -> None:
    if status != "completed":
        raise AppError(code="comic_task_not_ready", message="comic task is not completed", status_code=409)


def require_character_cards(session: Session, *, task_id: str) -> list[ComicCharacterCard]:
    require_task(session, task_id)
    cards = list_character_cards(session, task_id=task_id)
    if not cards:
        raise AppError(code="comic_character_cards_not_ready", message="comic character cards are not ready", status_code=409)
    return cards


def create_reference_job(session: Session, *, card: ComicCharacterCard):
    return create_job(
        session,
        user_id=None,
        source="anonymous",
        prompt=card.multi_view_prompt,
        model_code="gpt-image-2",
        requested_count=1,
        mode="generate",
    )


def sync_card_reference_asset(session: Session, *, card: ComicCharacterCard) -> None:
    if card.reference_image_job_id is None or card.reference_asset_id is not None:
        return
    job = get_job(session, card.reference_image_job_id)
    if job.status != "succeeded":
        return
    results = list_job_results(session, job.id)
    if results:
        update_character_reference_asset(session, card=card, asset_id=results[0].asset_id)


def build_reference_payload(
    session: Session,
    *,
    cards: list[ComicCharacterCard],
    created_count: int,
    reused_count: int,
) -> dict:
    return {
        "character_count": len(cards),
        "created_count": created_count,
        "reused_count": reused_count,
        "ready": all(card.reference_asset_id is not None for card in cards),
        "characters": [character_reference_payload(session, card=card) for card in cards],
    }


def character_reference_payload(session: Session, *, card: ComicCharacterCard) -> dict:
    payload = base_character_payload(card)
    if card.reference_image_job_id is None:
        return payload
    job = get_job(session, card.reference_image_job_id)
    payload["image_status"] = job.status
    payload["error_message"] = job.error_message
    return payload


def base_character_payload(card: ComicCharacterCard) -> dict:
    return {
        "id": card.id,
        "character_code": card.character_code,
        "name": card.name,
        "reference_image_job_id": card.reference_image_job_id,
        "reference_asset_id": card.reference_asset_id,
        "image_status": None,
        "error_message": None,
    }


def require_all_references_ready(session: Session, *, task_id: str) -> None:
    cards = require_character_cards(session, task_id=task_id)
    if any(card.reference_asset_id is None for card in cards):
        raise AppError(
            code=COMIC_REFERENCES_NOT_READY_CODE,
            message="comic character references are not ready",
            status_code=409,
        )
