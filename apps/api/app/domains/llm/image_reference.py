from __future__ import annotations

import re
from dataclasses import dataclass

from apps.api.app.core.errors import AppError

MARKDOWN_IMAGE_PATTERN = re.compile(r"!\[[^\]]*\]\((https?://[^\s)]+)\)")


@dataclass(frozen=True)
class ImageReference:
    kind: str
    value: str


def extract_image_reference(payload: dict[str, object]) -> ImageReference:
    data_reference = extract_data_reference(payload)
    if data_reference is not None:
        return data_reference
    text = extract_response_text(payload)
    url = extract_markdown_image_url(text)
    if url is not None:
        return ImageReference(kind="url", value=url)
    if text.strip():
        raise AppError(
            code="provider_content_refused",
            message=text[:500],
            status_code=502,
        )
    raise AppError(code="provider_response_invalid", message="provider response missing image data", status_code=502)


def extract_data_reference(payload: dict[str, object]) -> ImageReference | None:
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        return None
    first_item = data[0]
    if not isinstance(first_item, dict):
        raise AppError(code="provider_response_invalid", message="provider response item invalid", status_code=502)
    encoded = first_item.get("b64_json")
    if isinstance(encoded, str) and encoded:
        return ImageReference(kind="base64", value=encoded)
    url = first_item.get("url")
    if isinstance(url, str) and url.startswith(("http://", "https://")):
        return ImageReference(kind="url", value=url)
    return None


def extract_response_text(payload: dict[str, object]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text
    choices_text = extract_choices_text(payload.get("choices"))
    if choices_text:
        return choices_text
    output_text = extract_output_content_text(payload.get("output"))
    return output_text or ""


def extract_choices_text(choices: object) -> str:
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""
    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return content if isinstance(content, str) else ""


def extract_output_content_text(output: object) -> str:
    if not isinstance(output, list) or not output:
        return ""
    first_output = output[0]
    if not isinstance(first_output, dict):
        return ""
    content = first_output.get("content")
    if not isinstance(content, list) or not content:
        return ""
    first_content = content[0]
    if not isinstance(first_content, dict):
        return ""
    text = first_content.get("text")
    return text if isinstance(text, str) else ""


def extract_markdown_image_url(text: str) -> str | None:
    match = MARKDOWN_IMAGE_PATTERN.search(text)
    if match is None:
        return None
    return match.group(1)
