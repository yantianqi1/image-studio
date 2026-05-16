from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OpenRouterImageSize:
    size: str
    aspect_ratio: str


OPENROUTER_IMAGE_SIZE_OPTIONS: tuple[OpenRouterImageSize, ...] = (
    OpenRouterImageSize(size="1024x1024", aspect_ratio="1:1"),
    OpenRouterImageSize(size="1248x832", aspect_ratio="3:2"),
    OpenRouterImageSize(size="832x1248", aspect_ratio="2:3"),
    OpenRouterImageSize(size="1184x864", aspect_ratio="4:3"),
    OpenRouterImageSize(size="864x1184", aspect_ratio="3:4"),
    OpenRouterImageSize(size="1152x896", aspect_ratio="5:4"),
    OpenRouterImageSize(size="896x1152", aspect_ratio="4:5"),
    OpenRouterImageSize(size="1344x768", aspect_ratio="16:9"),
    OpenRouterImageSize(size="768x1344", aspect_ratio="9:16"),
    OpenRouterImageSize(size="1536x672", aspect_ratio="21:9"),
)

OPENROUTER_IMAGE_SIZES: tuple[str, ...] = tuple(option.size for option in OPENROUTER_IMAGE_SIZE_OPTIONS)
OPENROUTER_SIZE_TO_ASPECT_RATIO: dict[str, str] = {
    option.size: option.aspect_ratio for option in OPENROUTER_IMAGE_SIZE_OPTIONS
}
