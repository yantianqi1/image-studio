from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.comic.models import ComicCharacterCard, ComicPanelPrompt
from apps.api.app.domains.image.service import get_job, list_job_results


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


def build_approval_payload(*, prompts: list[ComicPanelPrompt], created_count: int, reused_count: int) -> dict:
    return {
        "created_count": created_count,
        "reused_count": reused_count,
        "prompts": [panel_prompt_payload(prompt) for prompt in prompts],
    }


def panel_prompt_payload(prompt: ComicPanelPrompt) -> dict:
    return {
        "id": prompt.id,
        "task_id": prompt.task_id,
        "image_index": prompt.image_index,
        "image_job_id": prompt.image_job_id,
        "asset_id": prompt.asset_id,
        "prompt": prompt.prompt,
    }


def prompt_image_result_payload(session: Session, *, prompt: ComicPanelPrompt) -> dict:
    payload = panel_prompt_payload(prompt)
    payload.update({"image_status": None, "error_message": None, "result": None})
    if prompt.image_job_id is None:
        return payload
    job = get_job(session, prompt.image_job_id)
    payload["image_status"] = job.status
    payload["error_message"] = job.error_message
    results = list_job_results(session, job.id)
    if results:
        payload["result"] = image_result_payload(results[0])
    return payload


def image_result_payload(result) -> dict:
    return {
        "id": result.id,
        "job_id": result.job_id,
        "asset_id": result.asset_id,
        "asset_url": result.asset_url,
        "revised_prompt": result.revised_prompt,
        "provider_request_id": result.provider_request_id,
    }
