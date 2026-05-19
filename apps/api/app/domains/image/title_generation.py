from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.feature_settings import FEATURE_IMAGE_JOB_TITLE, get_llm_feature_model_code
from apps.api.app.domains.llm.openai_chat import generate_structured_chat

IMAGE_JOB_TITLE_MAX_CHARS = 10
PENDING_IMAGE_JOB_TITLE = "__image_job_title_pending__"
IMAGE_JOB_TITLE_SYSTEM_PROMPT = """
你是创作台历史记录标题生成器。根据用户本次生图提示词，生成一个极短中文标题。

要求：
- 只返回 JSON 对象，字段为 title。
- title 必须是 10个汉字以内。
- title 不要包含引号、句号、冒号、编号、模型名或“图片/作品/标题”等泛词。
- 优先概括主体、场景或风格，例如：雨夜少女、金色咖啡罐、赛博街角。
""".strip()
IMAGE_JOB_TITLE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}},
    "required": ["title"],
}


def generate_image_job_title(session: Session, *, prompt: str) -> str:
    payload = generate_structured_chat(
        session,
        system_prompt=IMAGE_JOB_TITLE_SYSTEM_PROMPT,
        user_payload={"prompt": prompt.strip()},
        schema_name="ImageJobTitle",
        response_schema=IMAGE_JOB_TITLE_RESPONSE_SCHEMA,
        model_code=get_llm_feature_model_code(session, FEATURE_IMAGE_JOB_TITLE),
    )
    return normalize_generated_title(payload.get("title"))


def normalize_generated_title(value: object) -> str:
    if not isinstance(value, str):
        raise AppError(code="image_job_title_invalid", message="image job title missing", status_code=502)
    title = strip_title_punctuation(value)
    if not title:
        raise AppError(code="image_job_title_invalid", message="image job title empty", status_code=502)
    if len(title) > IMAGE_JOB_TITLE_MAX_CHARS:
        raise AppError(code="image_job_title_too_long", message="image job title too long", status_code=502)
    return title


def strip_title_punctuation(value: str) -> str:
    return value.strip().strip(" \t\r\n\"'“”‘’《》<>【】[]（）()：:，,。.!！?？、-—_")
