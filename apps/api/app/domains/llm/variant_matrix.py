from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SizeDefinition:
    size: str
    aspect_ratio: str
    tier: str


QUALITY_OPTIONS: tuple[str, ...] = ("low", "medium", "high")

TIERS: tuple[str, ...] = ("standard", "hd", "2k", "4k")

ALL_SIZES: tuple[SizeDefinition, ...] = (
    # 1:1
    SizeDefinition(size="1024x1024", aspect_ratio="1:1", tier="standard"),
    SizeDefinition(size="1536x1536", aspect_ratio="1:1", tier="hd"),
    SizeDefinition(size="2048x2048", aspect_ratio="1:1", tier="2k"),
    SizeDefinition(size="4096x4096", aspect_ratio="1:1", tier="4k"),
    # 3:2
    SizeDefinition(size="1152x768", aspect_ratio="3:2", tier="standard"),
    SizeDefinition(size="1728x1152", aspect_ratio="3:2", tier="hd"),
    SizeDefinition(size="2304x1536", aspect_ratio="3:2", tier="2k"),
    SizeDefinition(size="4096x2736", aspect_ratio="3:2", tier="4k"),
    # 16:9
    SizeDefinition(size="1280x720", aspect_ratio="16:9", tier="standard"),
    SizeDefinition(size="1920x1080", aspect_ratio="16:9", tier="hd"),
    SizeDefinition(size="2560x1440", aspect_ratio="16:9", tier="2k"),
    SizeDefinition(size="3840x2160", aspect_ratio="16:9", tier="4k"),
    # 21:9
    SizeDefinition(size="1344x576", aspect_ratio="21:9", tier="standard"),
    SizeDefinition(size="2016x864", aspect_ratio="21:9", tier="hd"),
    SizeDefinition(size="2688x1152", aspect_ratio="21:9", tier="2k"),
    SizeDefinition(size="3840x1644", aspect_ratio="21:9", tier="4k"),
    # 9:16
    SizeDefinition(size="720x1280", aspect_ratio="9:16", tier="standard"),
    SizeDefinition(size="1080x1920", aspect_ratio="9:16", tier="hd"),
    SizeDefinition(size="1440x2560", aspect_ratio="9:16", tier="2k"),
    SizeDefinition(size="2160x3840", aspect_ratio="9:16", tier="4k"),
    # 4:3
    SizeDefinition(size="1024x768", aspect_ratio="4:3", tier="standard"),
    SizeDefinition(size="1600x1200", aspect_ratio="4:3", tier="hd"),
    SizeDefinition(size="2048x1536", aspect_ratio="4:3", tier="2k"),
    SizeDefinition(size="4096x3072", aspect_ratio="4:3", tier="4k"),
    # 3:4
    SizeDefinition(size="768x1024", aspect_ratio="3:4", tier="standard"),
    SizeDefinition(size="1200x1600", aspect_ratio="3:4", tier="hd"),
    SizeDefinition(size="1536x2048", aspect_ratio="3:4", tier="2k"),
    SizeDefinition(size="3072x4096", aspect_ratio="3:4", tier="4k"),
)

ALL_VARIANT_KEYS: frozenset[tuple[str, str]] = frozenset(
    (sd.size, quality) for sd in ALL_SIZES for quality in QUALITY_OPTIONS
)

ASPECT_RATIOS: tuple[str, ...] = ("1:1", "3:2", "16:9", "21:9", "9:16", "4:3", "3:4")
