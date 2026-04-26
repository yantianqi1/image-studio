from __future__ import annotations

import re
from dataclasses import dataclass

from apps.api.app.core.errors import AppError


@dataclass(frozen=True)
class ComicStylePreset:
    id: str
    label_zh: str
    label_en: str
    best_for: str
    base_prompt: str
    negative_prompt: str


DEFAULT_STYLE_PRESET_ID = "neo_chinese"
ALIAS_SEPARATOR_PATTERN = re.compile(r"[\s\-_]+")


STYLE_PRESETS = {
    "ink_wash": ComicStylePreset(
        id="ink_wash",
        label_zh="水墨风漫画",
        label_en="Ink Wash Comic",
        best_for="仙侠、古风战斗、留白意境",
        base_prompt=(
            "Style name: Ink Wash Comic / 水墨风漫画.\n"
            "Core visual language: Chinese ink wash painting (sumi-e) translated into a readable modern manga/manhua panel.\n"
            "Line and texture: dynamic brushstrokes, bold ink splashes, dry brush texture, expressive clean lineart, ink shading, screentone dots for shadows.\n"
            "Color: subtle monochrome foundation with selective muted color accents only.\n"
            "Composition: dramatic negative space, fluid motion lines, poetic rhythm, strong silhouette clarity.\n"
            "Best suited for: xianxia, ancient Chinese fantasy, sword fights, atmospheric landscapes.\n"
            "Avoid: generic anime coloring, plastic 3D render, western superhero proportions."
        ),
        negative_prompt="neon cyberpunk colors, plastic 3D rendering, western superhero anatomy, cluttered full-color noise",
    ),
    "gongbi": ComicStylePreset(
        id="gongbi",
        label_zh="工笔重彩漫画",
        label_en="Meticulous Color Comic",
        best_for="宫廷、玄幻、历史题材",
        base_prompt=(
            "Style name: Meticulous Color Comic / 工笔重彩漫画.\n"
            "Core visual language: meticulous Chinese gongbi painting adapted into an elegant modern manhua panel.\n"
            "Line and texture: delicate detailed linework, refined contours, ornate fabric/accessory textures, polished character finish.\n"
            "Color: flat yet rich color washes, elegant mineral-like palette, soft screen tones.\n"
            "Composition: flowing hair, graceful proportions, floral and cloud motifs, courtly decorative backgrounds.\n"
            "Best suited for: palace drama, historical fantasy, xuanhuan, refined emotional closeups.\n"
            "Avoid: rough sketch lines, muddy colors, casual modern fashion unless explicitly required."
        ),
        negative_prompt="rough sketch lines, muddy colors, casual modern clothing unless specified, messy painterly smears",
    ),
    "neo_chinese": ComicStylePreset(
        id="neo_chinese",
        label_zh="线性新国风漫画",
        label_en="Linear Neo-Chinese",
        best_for="商业插图、明丽色彩、广泛题材",
        base_prompt=(
            "Style name: Linear Neo-Chinese / 线性新国风漫画.\n"
            "Core visual language: modern commercial neo-Chinese comic illustration with high readability.\n"
            "Line and texture: crisp intricate vector-like lineart, clean borders, precise facial features, controlled detail density.\n"
            "Color: bold flat colors, high-contrast cel shading, bright but harmonious Chinese-inspired palette.\n"
            "Composition: dynamic perspective, strong focal point, fashionable character design, graphic modern layout with traditional Chinese elements.\n"
            "Best suited for: broad commercial manhua, modern fantasy, action, urban stories, clean cinematic panels.\n"
            "Avoid: cluttered backgrounds, inconsistent faces, generic school-uniform anime look."
        ),
        negative_prompt="cluttered backgrounds, inconsistent faces, generic anime school uniforms, low-detail faces, muddy lighting",
    ),
    "baimiao": ComicStylePreset(
        id="baimiao",
        label_zh="白描武侠漫画",
        label_en="Baimiao Line-art Comic",
        best_for="武侠、热血、快节奏打斗",
        base_prompt=(
            "Style name: Baimiao Line-art Comic / 白描武侠漫画.\n"
            "Core visual language: pure Chinese baimiao line drawing technique adapted into a clean manga/manhua action panel.\n"
            "Line and texture: no color, varied ink line weights, expressive contour lines, subtle hatching, woodblock-like texture.\n"
            "Color: black ink on light paper only, no full color rendering.\n"
            "Composition: dynamic action poses, speed lines, minimal background, clear martial body mechanics and weapon silhouettes.\n"
            "Best suited for: wuxia combat, fast-paced duels, heroic tension, sparse dramatic pages.\n"
            "Avoid: heavy painterly texture, excessive color, sci-fi armor, soft pastel rendering."
        ),
        negative_prompt="heavy painterly textures, excessive color, sci-fi armor, pastel chibi proportions, full-color render",
    ),
    "guochao_chibi": ComicStylePreset(
        id="guochao_chibi",
        label_zh="国潮Q版漫画",
        label_en="Guochao Chibi Comic",
        best_for="日常、搞笑、治愈剧情",
        base_prompt=(
            "Style name: Guochao Chibi Comic / 国潮Q版漫画.\n"
            "Core visual language: cute guochao chibi webtoon panel with traditional Chinese symbols made friendly and playful.\n"
            "Line and texture: soft rounded lineart, simplified forms, expressive faces, cute short proportions.\n"
            "Color: bright pastel colors, warm cheerful palette, clean flat fills.\n"
            "Composition: modern vertical webtoon layout, fluffy stylized clouds, simple nature/decorative Chinese motifs, speech-bubble-ready spacing.\n"
            "Best suited for: daily life, comedy, healing stories, light fantasy, mascot-like moments.\n"
            "Avoid: horror realism, long realistic proportions, gloomy desaturated lighting."
        ),
        negative_prompt="horror realism, long realistic proportions, gloomy desaturated lighting, gritty gore, realistic anatomy",
    ),
    "dark_gothic": ComicStylePreset(
        id="dark_gothic",
        label_zh="暗黑志怪风漫画",
        label_en="Dark Chinese Gothic",
        best_for="悬疑、志怪、克苏鲁式奇幻",
        base_prompt=(
            "Style name: Dark Chinese Gothic / 暗黑志怪风漫画.\n"
            "Core visual language: horror manhua panel with dark Chinese gothic atmosphere inspired by Buddhist/Taoist occult art and zhiguai folklore.\n"
            "Line and texture: grungy ink textures, moody cross-hatched shading, distorted monstrous silhouettes, rough ritual marks.\n"
            "Color: deep black and gray atmosphere with restrained blood-red accent colors.\n"
            "Composition: chiaroscuro lighting, religious iconography, oppressive negative space, chaotic dread contained within neat comic borders.\n"
            "Best suited for: mystery, folklore horror, monsters, temples, occult fantasy.\n"
            "Avoid: cheerful pastel palette, cute mascot tone, clean sterile sci-fi sets."
        ),
        negative_prompt="cheerful pastel palette, cute mascot tone, clean sterile sci-fi sets, comedy chibi style, bright daylight tone",
    ),
    "exquisite_3d_donghua": ComicStylePreset(
        id="exquisite_3d_donghua",
        label_zh="国风3D精美动漫",
        label_en="Exquisite 3D Donghua Style",
        best_for="仙侠、古装奇幻、史诗动作",
        base_prompt=(
            "Style name: Exquisite 3D Donghua Style / 国风3D精美动漫.\n"
            "Core visual language: high-budget 3D Chinese donghua animation film aesthetics adapted into clean, readable manhua page panels.\n"
            "Rendering: exquisite cel-shaded 3D render with anime aesthetics, expressive faces, glossy eyes with specular highlights, dynamic hair physics, polished cloth and skin materials.\n"
            "Lighting and atmosphere: cinematic volumetric lighting, soft atmospheric fog, dramatic depth of field, rim light, epic and poetic mood.\n"
            "Costume and setting: detailed traditional Chinese costumes, flowing silk, intricate embroidery, ornate ancient architecture, misty mountains, temples, palaces, clouds and water motifs when appropriate.\n"
            "Composition: cinematic camera angles, clean manga panel composition, crisp comic borders, subtle speed lines, strong silhouette clarity across every panel.\n"
            "Best suited for: xianxia, ancient fantasy adventure, palace drama, poetic action, premium character closeups.\n"
            "Avoid: cheap mobile-game render, waxy plastic skin, over-saturated clutter, western medieval armor unless specified, flat lighting."
        ),
        negative_prompt="cheap mobile-game render, waxy plastic skin, flat lighting, over-saturated clutter, low-detail costume embroidery, western medieval armor unless specified",
    ),
}


def normalize_style_preset_id(style_preset_id: object | None) -> str:
    raw_value = normalize_raw_style_value(style_preset_id)
    if not raw_value:
        return DEFAULT_STYLE_PRESET_ID
    preset_id = build_style_preset_aliases().get(normalize_style_alias(raw_value))
    if preset_id is None:
        raise_invalid_style_preset(raw_value)
    return preset_id


def get_style_preset(style_preset_id: str) -> ComicStylePreset:
    return STYLE_PRESETS[normalize_style_preset_id(style_preset_id)]


def build_style_preset_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for preset in STYLE_PRESETS.values():
        for alias in (preset.id, preset.label_zh, preset.label_en):
            aliases[normalize_style_alias(alias)] = preset.id
    return aliases


def normalize_raw_style_value(value: object | None) -> str:
    return "" if value is None else str(value).strip()


def normalize_style_alias(value: str) -> str:
    return ALIAS_SEPARATOR_PATTERN.sub("_", value.strip().lower())


def raise_invalid_style_preset(raw_value: str) -> None:
    supported = ", ".join(STYLE_PRESETS.keys())
    raise AppError(
        code="comic_style_preset_invalid",
        message=f"unknown comic style preset: {raw_value}. Supported style presets: {supported}",
        status_code=422,
    )
