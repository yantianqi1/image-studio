from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.domains.llm.client_provider import read_client_provider_config
from apps.api.app.domains.prompt_crafter.service import stream_prompt_crafter_sse_completion

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


@public_router.post("/chat/stream")
def stream_prompt_crafter_chat(
    payload: PromptCrafterStreamRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    messages = [message.model_dump() for message in payload.messages]
    stream = stream_prompt_crafter_sse_completion(
        session,
        messages=messages,
        client_provider_config=read_client_provider_config(request),
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=PROMPT_CRAFTER_STREAM_HEADERS)
