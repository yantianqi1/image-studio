from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.domains.comic.structured_outputs import CharacterBible, Storyboard, StoryboardImage
from apps.api.app.domains.comic.style_presets import get_style_preset


@dataclass(frozen=True)
class PanelPromptDraft:
    image_index: int
    panel_count: int
    character_codes: list[str]
    prompt: str
    negative_prompt: str
    model_code: str


def compose_panel_prompts(
    *,
    storyboard: Storyboard,
    character_bible: CharacterBible,
    style_preset_id: str,
    model_code: str,
) -> list[PanelPromptDraft]:
    preset = get_style_preset(style_preset_id)
    character_map = {character.character_code: character for character in character_bible.characters}
    return [
        compose_single_prompt(
            image=image,
            character_map=character_map,
            style_base_prompt=preset.base_prompt,
            model_code=model_code,
        )
        for image in storyboard.images
    ]


def compose_single_prompt(*, image: StoryboardImage, character_map: dict, style_base_prompt: str, model_code: str) -> PanelPromptDraft:
    character_codes = collect_character_codes(image=image)
    negative_prompt = build_negative_prompt(character_codes=character_codes, character_map=character_map)
    prompt_parts = [
        build_prompt_header(),
        build_style_block(style_base_prompt),
        build_output_format_and_quality_instruction(),
        build_layout_instruction(panel_count=len(image.panels)),
        build_chinese_text_instruction(),
        build_character_block(character_codes=character_codes, character_map=character_map),
        build_panel_descriptions(image=image),
        build_global_constraints(),
        f"Negative prompt: {negative_prompt}",
    ]
    return PanelPromptDraft(
        image_index=image.image_index,
        panel_count=len(image.panels),
        character_codes=character_codes,
        prompt="\n\n".join(part for part in prompt_parts if part),
        negative_prompt=negative_prompt,
        model_code=model_code,
    )


def build_prompt_header() -> str:
    return "Task: Generate one finished vertical Chinese comic page from the storyboard below."


def build_style_block(style_base_prompt: str) -> str:
    return f"Style preset:\n{style_base_prompt}"


def build_output_format_and_quality_instruction() -> str:
    return (
        "Output format and image quality:\n"
        "Generate a high-resolution vertical Chinese comic page, portrait format, optimized for a 9:16 mobile "
        "webtoon-style reading experience.\n"
        "The composition must clearly fit inside one full page image, with all comic panels fully visible, evenly "
        "spaced, and not cropped.\n"
        "Use crisp lineart, sharp facial details, readable hands, clean silhouettes, clear panel borders, and clean "
        "color separation.\n"
        "Prioritize readability over decoration. The image should feel like a finished professional manhua page, not "
        "a sketch, draft, poster, concept art, or single illustration.\n"
        "Avoid low-resolution artifacts, blurry faces, compressed panels, crowded layouts, excessive background "
        "detail, tiny unreadable text, cropped borders, and messy visual noise."
    )


def collect_character_codes(*, image: StoryboardImage) -> list[str]:
    codes: list[str] = []
    for panel in image.panels:
        for code in panel.characters:
            if code not in codes:
                codes.append(code)
    return codes


def build_layout_instruction(*, panel_count: int) -> str:
    return (
        f"Page layout:\nCreate one vertical comic page containing exactly {panel_count} clearly separated panels.\n"
        "Use clean comic borders. Keep panel order top-to-bottom.\n"
        "Do not add extra panels."
    )


def build_chinese_text_instruction() -> str:
    return (
        "Visible Chinese text requirements:\n"
        "All visible text, dialogue, captions, signs, and SFX must be in Simplified Chinese.\n"
        "Do not render English words, roman letters, garbled pseudo-text, or Japanese kana in speech bubbles/signs.\n"
        "If the storyboard dialogue is empty, leave speech bubbles out instead of inventing text."
    )


def build_character_block(*, character_codes: list[str], character_map: dict) -> str:
    if not character_codes:
        return "Character consistency requirements: No recurring named characters appear on this page."
    blocks = [
        "Character consistency requirements:",
        "Character identity lock:",
        "Each named character must remain the exact same person in every panel on this image.",
        "Use attached reference character sheets as canonical identity sources.",
        "Do not reinterpret age, face shape, hairstyle, body type, costume silhouette, color palette, or signature items between panels.",
        "If a character appears in multiple panels, copy the same identity design from the reference sheet into every panel.",
        "Use the following character anchors whenever these characters appear.",
    ]
    for code in character_codes:
        character = character_map.get(code)
        if character is not None:
            blocks.append(f"[Character Anchor: {character.name}]\n{character.must_keep_prompt}")
    return "\n".join(blocks)


def build_panel_descriptions(*, image: StoryboardImage) -> str:
    lines = [f"Storyboard panels for image {image.image_index} ({image.page_purpose}):"]
    for panel in image.panels:
        dialogue = panel.dialogue or "无"
        sfx = panel.sfx or "无"
        lines.append(
            f"Panel {panel.panel_index}: {panel.scene_description} Camera: {panel.camera}. "
            f"Composition: {panel.composition}. Emotion: {panel.emotion}. "
            f"Visible Chinese dialogue: {dialogue}. Visible Chinese SFX: {sfx}. "
            f"Continuity: {panel.continuity_notes}."
        )
    return "\n".join(lines)


def build_global_constraints() -> str:
    return (
        "Global constraints:\n"
        "No extra characters unless specified.\n"
        "No text except requested dialogue placeholders.\n"
        "Keep the same character designs across all panels.\n"
        "No alternate outfits unless explicitly specified.\n"
        "Do not change hair length, hair color, facial structure, age, or body type.\n"
        "Do not treat separate panels as separate character design opportunities."
    )


def build_negative_prompt(*, character_codes: list[str], character_map: dict) -> str:
    return "; ".join(character_map[code].negative_prompt for code in character_codes if code in character_map)
