from __future__ import annotations

import json

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicTask
from apps.api.app.domains.comic.repository import (
    list_character_cards,
    update_character_reference_asset,
    update_character_reference_job,
)
from apps.api.app.domains.comic.services import require_task
from apps.api.app.domains.image.service import create_job, get_job, list_job_results
from apps.api.app.domains.llm.client_provider import (
    CLIENT_PROVIDER_SOURCE,
    ClientProviderConfig,
    client_provider_config_from_mapping,
)

COMIC_REFERENCES_NOT_READY_CODE = "comic_character_references_not_ready"
PER_CHARACTER_REFERENCE_MODE = "per_character"
SINGLE_SHEET_REFERENCE_MODE = "single_sheet"
VALID_CHARACTER_REFERENCE_MODES = {PER_CHARACTER_REFERENCE_MODE, SINGLE_SHEET_REFERENCE_MODE}


def approve_character_references(session: Session, task_id: str) -> dict:
    task = require_task(session, task_id)
    require_completed_task_status(task.status)
    cards = require_character_cards(session, task_id=task.id)
    mode = parse_character_reference_mode(task.input_payload)
    if mode == SINGLE_SHEET_REFERENCE_MODE:
        return approve_single_sheet_reference(session, task=task, cards=cards)
    return approve_per_character_references(session, task=task, cards=cards)


def approve_per_character_references(session: Session, *, task: ComicTask, cards: list[ComicCharacterCard]) -> dict:
    created_count = 0
    reused_count = 0
    for card in cards:
        if card.reference_image_job_id is not None:
            reused_count += 1
            continue
        job = create_reference_job(session, task=task, card=card)
        update_character_reference_job(session, card=card, job_id=job.id)
        created_count += 1
    session.commit()
    return build_reference_payload(session, cards=cards, created_count=created_count, reused_count=reused_count)


def approve_single_sheet_reference(session: Session, *, task: ComicTask, cards: list[ComicCharacterCard]) -> dict:
    existing_job_id = single_existing_reference_job_id(cards)
    if existing_job_id is not None:
        session.commit()
        return build_reference_payload(session, cards=cards, created_count=0, reused_count=1)
    job = create_shared_reference_job(session, task=task, cards=cards)
    for card in cards:
        update_character_reference_job(session, card=card, job_id=job.id)
    session.commit()
    return build_reference_payload(session, cards=cards, created_count=1, reused_count=0)


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


def create_reference_job(session: Session, *, task: ComicTask, card: ComicCharacterCard):
    client_config = resolve_task_client_provider_config(task)
    return create_job(
        session,
        user_id=task.user_id,
        source=resolve_image_job_source(task=task, client_config=client_config),
        prompt=card.multi_view_prompt,
        model_code="gpt-image-2",
        requested_count=1,
        mode="generate",
        client_access_id=client_config.client_id if client_config else None,
        client_provider_config=client_config,
    )


def create_shared_reference_job(session: Session, *, task: ComicTask, cards: list[ComicCharacterCard]):
    client_config = resolve_task_client_provider_config(task)
    return create_job(
        session,
        user_id=task.user_id,
        source=resolve_image_job_source(task=task, client_config=client_config),
        prompt=build_single_sheet_prompt(cards),
        model_code="gpt-image-2",
        requested_count=1,
        mode="generate",
        client_access_id=client_config.client_id if client_config else None,
        client_provider_config=client_config,
    )


def build_single_sheet_prompt(cards: list[ComicCharacterCard]) -> str:
    header = [
        "Generate one clean all-character reference sheet for a Chinese comic.",
        "Neutral white or light gray background. No environment, no story scene, no action sequence.",
        "Show each listed character exactly once as a clear full-body standing design.",
        "Do not render text labels, dialogue, captions, panel borders, props not listed, or extra people.",
        "The image is only for character identity: fixed face, hairstyle, costume silhouette, and colors.",
    ]
    return "\n".join([*header, "", *character_sheet_lines(cards)])


def character_sheet_lines(cards: list[ComicCharacterCard]) -> list[str]:
    lines: list[str] = []
    for index, card in enumerate(cards, start=1):
        lines.extend(single_character_sheet_lines(index=index, card=card))
    return lines


def single_character_sheet_lines(*, index: int, card: ComicCharacterCard) -> list[str]:
    return [
        f"Character {index}: {card.name} ({card.character_code}).",
        f"Appearance: {stable_json(card.appearance)}.",
        f"Costume: {stable_json(card.costume)}.",
        f"Color palette: {stable_json(card.color_palette)}.",
        f"Identity lock: {card.must_keep_prompt}",
        f"Avoid: {card.negative_prompt}",
    ]


def stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def single_existing_reference_job_id(cards: list[ComicCharacterCard]) -> int | None:
    job_ids = {card.reference_image_job_id for card in cards if card.reference_image_job_id is not None}
    if not job_ids:
        return None
    if len(job_ids) == 1 and all(card.reference_image_job_id is not None for card in cards):
        return next(iter(job_ids))
    raise AppError(code="comic_character_reference_state_invalid", message="single-sheet reference job state is inconsistent", status_code=409)


def parse_character_reference_mode(input_payload: dict | None) -> str:
    mode = str((input_payload or {}).get("character_reference_mode") or PER_CHARACTER_REFERENCE_MODE).strip()
    if mode in VALID_CHARACTER_REFERENCE_MODES:
        return mode
    raise AppError(code="comic_character_reference_mode_invalid", message=f"comic character_reference_mode invalid: {mode}", status_code=422)


def resolve_task_client_provider_config(task: ComicTask) -> ClientProviderConfig | None:
    if not task.client_provider_config:
        return None
    return client_provider_config_from_mapping(task.client_provider_config)


def resolve_image_job_source(*, task: ComicTask, client_config: ClientProviderConfig | None) -> str:
    if client_config is not None:
        return CLIENT_PROVIDER_SOURCE
    return "member" if task.user_id is not None else "anonymous"


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
