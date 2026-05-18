from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.domains.auth.ownership import ensure_anonymous_owner
from apps.api.app.domains.prompt_crafter.service import (
    stream_prompt_crafter_reverse_image_sse_completion,
    stream_prompt_crafter_sse_completion,
)

public_router = APIRouter(prefix="/prompt-crafter", tags=["prompt-crafter-public"])
PROMPT_CRAFTER_STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}


class PromptCrafterChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class PromptCrafterStreamRequest(BaseModel):
    messages: list[PromptCrafterChatMessage] = Field(min_length=1)


class PromptCrafterReverseImageStreamRequest(BaseModel):
    asset_ids: list[Annotated[int, Field(ge=1)]] = Field(min_length=1)
    note: str = ""


@public_router.post("/chat/stream")
def stream_prompt_crafter_chat(
    payload: PromptCrafterStreamRequest,
    session: Session = Depends(get_db_session),
):
    messages = [message.model_dump() for message in payload.messages]
    stream = stream_prompt_crafter_sse_completion(
        session,
        messages=messages,
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=PROMPT_CRAFTER_STREAM_HEADERS)


@public_router.post("/reverse-image/stream")
def stream_prompt_crafter_reverse_image(
    payload: PromptCrafterReverseImageStreamRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
):
    owner = ensure_anonymous_owner(request, response, session)
    stream = stream_prompt_crafter_reverse_image_sse_completion(
        session,
        owner=owner,
        asset_ids=payload.asset_ids,
        note=payload.note,
    )
    session.commit()
    return StreamingResponse(stream, media_type="text/event-stream", headers=PROMPT_CRAFTER_STREAM_HEADERS)
