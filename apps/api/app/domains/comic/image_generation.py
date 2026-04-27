from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.comic.quota import consume_public_quota_for_comic_image_job
from apps.api.app.domains.comic.character_references import COMIC_REFERENCES_NOT_READY_CODE, require_all_references_ready
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicPanelPrompt, ComicTask
from apps.api.app.domains.comic.ownership import require_task_for_owner
from apps.api.app.domains.comic.payloads import (
    build_approval_payload,
    panel_prompt_payload,
    prompt_image_result_payload,
)
from apps.api.app.domains.image.service import create_job as create_image_job
from apps.api.app.domains.image.service import get_job as get_image_job
from apps.api.app.domains.image.service import list_reference_asset_ids
from apps.api.app.domains.llm.client_provider import (
    CLIENT_PROVIDER_SOURCE,
    ClientProviderConfig,
    client_provider_config_from_mapping,
)


def approve_task_image_generation(session: Session, task_id: str, *, owner: OwnerContext) -> dict:
    task = require_task_for_owner(session, task_id, owner)
    require_completed_task(task)
    prompts = list_ready_panel_prompts(session, task_id=task.id)
    if not prompts:
        raise AppError(code="comic_prompts_not_ready", message="comic panel prompts are not ready", status_code=409)
    require_all_references_ready(session, task_id=task.id, owner=owner)
    created_count, reused_count = enqueue_missing_image_jobs(session, task=task, prompts=prompts)
    session.commit()
    return build_approval_payload(prompts=prompts, created_count=created_count, reused_count=reused_count)


def regenerate_prompt_image(session: Session, prompt_id: int, *, owner: OwnerContext) -> dict:
    prompt = require_panel_prompt(session, prompt_id)
    require_completed_task(require_task_for_owner(session, prompt.task_id, owner))
    reference_asset_ids = resolve_prompt_reference_asset_ids(session, prompt=prompt)
    task = require_task_for_owner(session, prompt.task_id, owner)
    prompt.image_job_id = enqueue_prompt_image_job(
        session,
        task=task,
        prompt=prompt,
        reference_asset_ids=reference_asset_ids,
    ).id
    prompt.asset_id = None
    session.commit()
    return panel_prompt_payload(prompt)


def list_task_image_results(session: Session, task_id: str, *, owner: OwnerContext) -> list[dict]:
    task = require_task_for_owner(session, task_id, owner)
    prompts = list_ready_panel_prompts(session, task_id=task.id)
    return [prompt_image_result_payload(session, prompt=prompt) for prompt in prompts]


def enqueue_missing_image_jobs(
    session: Session,
    *,
    task: ComicTask,
    prompts: list[ComicPanelPrompt],
) -> tuple[int, int]:
    created_count = 0
    reused_count = 0
    for prompt in prompts:
        reference_asset_ids = resolve_prompt_reference_asset_ids(session, prompt=prompt)
        if should_reuse_prompt_image_job(session, prompt=prompt, reference_asset_ids=reference_asset_ids):
            reused_count += 1
            continue
        prompt.image_job_id = enqueue_prompt_image_job(
            session,
            task=task,
            prompt=prompt,
            reference_asset_ids=reference_asset_ids,
        ).id
        prompt.asset_id = None
        created_count += 1
    return created_count, reused_count


def should_reuse_prompt_image_job(
    session: Session,
    *,
    prompt: ComicPanelPrompt,
    reference_asset_ids: list[int],
) -> bool:
    if prompt.image_job_id is None:
        return False
    job = get_image_job(session, prompt.image_job_id)
    if job.status == "failed":
        return False
    return list_reference_asset_ids(session, job_id=job.id) == reference_asset_ids


def list_ready_panel_prompts(session: Session, task_id: str) -> list[ComicPanelPrompt]:
    statement = select(ComicPanelPrompt).where(ComicPanelPrompt.task_id == task_id, ComicPanelPrompt.status == "prompt_ready")
    return list(session.execute(statement.order_by(ComicPanelPrompt.image_index.asc())).scalars())


def require_completed_task(task: ComicTask) -> None:
    if task.status != "completed":
        raise AppError(code="comic_task_not_ready", message="comic task is not completed", status_code=409)


def require_panel_prompt(session: Session, prompt_id: int) -> ComicPanelPrompt:
    prompt = session.get(ComicPanelPrompt, prompt_id)
    if prompt is None:
        raise AppError(code="comic_panel_prompt_not_found", message="comic panel prompt not found", status_code=404)
    return prompt


def resolve_prompt_reference_asset_ids(session: Session, *, prompt: ComicPanelPrompt) -> list[int]:
    character_codes = list(prompt.character_codes or [])
    if not character_codes:
        return []
    cards = list_prompt_character_cards(session, prompt=prompt, character_codes=character_codes)
    return unique_asset_ids([require_card_reference_asset(card) for card in cards])


def unique_asset_ids(asset_ids: list[int]) -> list[int]:
    unique_ids: list[int] = []
    for asset_id in asset_ids:
        if asset_id not in unique_ids:
            unique_ids.append(asset_id)
    return unique_ids


def list_prompt_character_cards(
    session: Session,
    *,
    prompt: ComicPanelPrompt,
    character_codes: list[str],
) -> list[ComicCharacterCard]:
    statement = select(ComicCharacterCard).where(
        ComicCharacterCard.task_id == prompt.task_id,
        ComicCharacterCard.character_code.in_(character_codes),
    )
    card_map = {card.character_code: card for card in session.execute(statement).scalars()}
    return [require_character_card(card_map, character_code=code) for code in character_codes]


def require_character_card(card_map: dict[str, ComicCharacterCard], *, character_code: str) -> ComicCharacterCard:
    card = card_map.get(character_code)
    if card is None:
        raise_references_not_ready()
    return card


def require_card_reference_asset(card: ComicCharacterCard) -> int:
    if card.reference_asset_id is None:
        raise_references_not_ready()
    return card.reference_asset_id


def raise_references_not_ready() -> None:
    raise AppError(
        code=COMIC_REFERENCES_NOT_READY_CODE,
        message="comic character references are not ready",
        status_code=409,
    )


def enqueue_prompt_image_job(
    session: Session,
    *,
    task: ComicTask,
    prompt: ComicPanelPrompt,
    reference_asset_ids: list[int] | None = None,
):
    client_config = resolve_task_client_provider_config(task)
    job = create_image_job(
        session,
        owner=task_owner(task),
        source=resolve_image_job_source(task=task, client_config=client_config),
        prompt=prompt.prompt,
        model_code=prompt.model_code,
        requested_count=1,
        mode="generate",
        reference_asset_ids=reference_asset_ids,
        client_access_id=client_config.client_id if client_config else None,
        client_provider_config=client_config,
    )
    consume_public_quota_for_comic_image_job(
        session,
        task=task,
        request_ip_hash=task.request_ip_hash,
        reference_type="comic_panel_image_job",
        reference_id=str(job.id),
    )
    return job


def resolve_task_client_provider_config(task: ComicTask) -> ClientProviderConfig | None:
    if not task.client_provider_config:
        return None
    return client_provider_config_from_mapping(task.client_provider_config)


def resolve_image_job_source(*, task: ComicTask, client_config: ClientProviderConfig | None) -> str:
    if client_config is not None:
        return CLIENT_PROVIDER_SOURCE
    return "member" if task.user_id is not None else "anonymous"


def task_owner(task: ComicTask) -> OwnerContext:
    return OwnerContext(user_id=task.user_id, anonymous_session_id=task.anonymous_session_id)
