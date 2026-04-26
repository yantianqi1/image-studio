from __future__ import annotations

from dataclasses import dataclass
from xml.sax.saxutils import escape

from apps.api.app.domains.llm.catalog import DEFAULT_MODEL_CODE, DEFAULT_PROVIDER_NAME


@dataclass(frozen=True)
class RenderedImage:
    content: bytes
    mime_type: str
    revised_prompt: str
    provider_request_id: str


def render_local_image(
    *,
    prompt: str,
    model_code: str = DEFAULT_MODEL_CODE,
    reference_asset_ids: tuple[int, ...] = (),
) -> RenderedImage:
    reference_text = build_reference_text(reference_asset_ids=reference_asset_ids)
    revised_prompt = f"{prompt}\n{reference_text}" if reference_text else prompt
    escaped_prompt = escape(revised_prompt or "Untitled image")
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="#f4e6d6"/>
      <rect x="48" y="48" width="928" height="928" rx="36" fill="#fff8f0" stroke="#1c1711" stroke-width="6"/>
      <text x="96" y="180" fill="#b14a24" font-family="Arial" font-size="48">image Studio</text>
      <text x="96" y="260" fill="#1c1711" font-family="Arial" font-size="72">{escape(model_code)}</text>
      <foreignObject x="96" y="340" width="832" height="520">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial; font-size: 32px; color: #1c1711; line-height: 1.45;">
          {escaped_prompt}
        </div>
      </foreignObject>
    </svg>
    """.strip()
    return RenderedImage(
        content=svg.encode("utf-8"),
        mime_type="image/svg+xml",
        revised_prompt=revised_prompt,
        provider_request_id=f"{DEFAULT_PROVIDER_NAME}:{abs(hash(prompt))}",
    )


def build_reference_text(*, reference_asset_ids: tuple[int, ...]) -> str:
    if not reference_asset_ids:
        return ""
    joined_ids = ", ".join(str(asset_id) for asset_id in reference_asset_ids)
    return f"Reference asset IDs: {joined_ids}"
