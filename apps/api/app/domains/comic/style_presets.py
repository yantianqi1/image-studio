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


DEFAULT_STYLE_PRESET_ID = "neo_chinese"
ALIAS_SEPARATOR_PATTERN = re.compile(r"[\s\-_]+")


STYLE_PRESETS = {
    "ink_wash": ComicStylePreset(
        id="ink_wash",
        label_zh="水墨风漫画",
        label_en="Ink Wash Comic",
        best_for="仙侠、古风战斗、留白意境",
        base_prompt="""Style name: Clean Ink Wash Comic / 水墨风漫画.

Create a clean, professional manhua panel in a Chinese ink wash style adapted for modern comic readability.

Core visual language:
Chinese ink wash painting aesthetics translated into a readable manga/manhua panel, with elegant brush-inspired line variation, soft ink shading, large clean negative space, poetic atmosphere, and clear subject silhouettes.

Line and texture:
Use expressive but controlled brush-like linework, clean contour definition, subtle ink diffusion, and sparse decorative ink accents. Ink texture should remain light, elegant, and secondary to readability. Do not let ink splashes, wash effects, or dry brush marks cover faces, hands, weapons, or important action silhouettes.

Color:
Use a mostly monochrome ink foundation with restrained muted color accents only when they improve focal clarity.

Composition:
Use strong silhouette clarity, clear focal hierarchy, dynamic but readable motion, and generous negative space. Backgrounds should be simplified and atmospheric rather than crowded.

Rendering rules:
Maintain crisp facial readability, clean panel borders, controlled shadows, and uncluttered visual structure. The main character and action must be immediately readable.

Constraints:
Avoid muddy ink buildup, dirty texture noise, excessive brush mess, cluttered scenery, screentone overload, blurry faces, chaotic shading, and over-rendered details. Avoid generic anime plastic coloring, glossy 3D rendering, and noisy backgrounds.

Best suited for:
xianxia, ancient Chinese fantasy, sword fights, poetic landscapes, atmospheric martial scenes.""",
    ),
    "gongbi": ComicStylePreset(
        id="gongbi",
        label_zh="工笔重彩漫画",
        label_en="Meticulous Color Comic",
        best_for="宫廷、玄幻、历史题材",
        base_prompt="""Style name: Clean Gongbi Color Comic / 工笔重彩漫画.

Create a clean, elegant manhua panel inspired by traditional Chinese gongbi painting, adapted for modern comic clarity and readability.

Core visual language:
A refined gongbi-inspired comic style with delicate precise linework, graceful character proportions, elegant traditional Chinese motifs, polished costume contours, and a calm decorative beauty.

Line and texture:
Use refined, clean, detailed linework with precise contours and controlled ornamental detail. Fabric patterns, accessories, and decorative motifs should appear refined and intentional, but never overwhelm the subject.

Color:
Use flat yet rich color washes with a luminous mineral-like palette, elegant color separation, soft tonal transitions, and a polished finish. Keep colors clean, clear, and separated rather than muddy or overblended.

Composition:
Use graceful figures, flowing hair, floral or cloud motifs, and decorative backgrounds that support the focal subject. Keep the focal character dominant and backgrounds secondary.

Rendering rules:
Maintain clean face rendering, clear silhouette hierarchy, controlled detail density, and a polished commercial manhua finish. Details should concentrate around the focal subject instead of filling the whole image.

Constraints:
Avoid muddy colors, excessive fabric noise, over-decorated backgrounds, rough sketchiness, chaotic textures, blurred facial features, and cluttered compositions. Avoid casual modern fashion unless explicitly requested.

Best suited for:
palace drama, historical fantasy, xuanhuan, elegant emotional closeups, noble court scenes.""",
    ),
    "neo_chinese": ComicStylePreset(
        id="neo_chinese",
        label_zh="线性新国风漫画",
        label_en="Linear Neo-Chinese",
        best_for="商业插图、明丽色彩、广泛题材",
        base_prompt="""Style name: Linear Neo-Chinese Comic / 线性新国风漫画.

Create a clean, professional commercial manhua panel in a modern neo-Chinese style with high readability.

Core visual language:
A modern Chinese-inspired comic illustration style with crisp elegant lineart, refined character design, strong graphic readability, and a fashionable balance between traditional Chinese elements and contemporary commercial manhua aesthetics.

Line and texture:
Use crisp, precise, controlled lineart with clean edges, refined facial features, and a polished comic finish. Detail density should remain controlled and intentional.

Color:
Use bold flat colors, clean color separation, and high-contrast cel shading with a bright but harmonious Chinese-inspired palette.

Composition:
Use dynamic perspective, strong focal points, clear silhouette readability, and a graphic modern panel layout enhanced by selective traditional Chinese motifs. Backgrounds should be simplified and clean, supporting the character rather than competing with them.

Rendering rules:
Maintain high face consistency, sharp focal hierarchy, clean panel readability, and a polished commercial finish. Decorative elements must frame the subject rather than fill the entire image.

Constraints:
Avoid cluttered backgrounds, inconsistent faces, muddy rendering, noisy texture buildup, over-detailed scenery, chaotic shading, and generic school-uniform anime styling unless explicitly requested.

Best suited for:
broad commercial manhua, modern fantasy, action, urban stories, clean cinematic panels, stylish promotional comic visuals.""",
    ),
    "baimiao": ComicStylePreset(
        id="baimiao",
        label_zh="白描武侠漫画",
        label_en="Baimiao Line-art Comic",
        best_for="武侠、热血、快节奏打斗",
        base_prompt="""Style name: Clean Baimiao Line-art Comic / 白描武侠漫画.

Create a clean, high-readability wuxia comic panel using Chinese baimiao line drawing aesthetics.

Core visual language:
A pure line-art martial arts comic style inspired by traditional Chinese baimiao drawing, adapted into a dynamic and readable manhua action panel.

Line and texture:
Use black ink on a light paper background only. Use varied line weights, expressive contours, subtle controlled hatching, and clean action-defining strokes. The linework should feel precise, energetic, and elegant, not scratchy or dirty.

Color:
No full-color rendering. Use black ink linework only, with minimal grayscale if needed for slight depth, but preserve a clean line-art appearance.

Composition:
Use strong action poses, clear weapon silhouettes, readable martial body mechanics, speed lines when needed, and sparse backgrounds. Keep the composition airy, focused, and dramatic.

Rendering rules:
Maintain clear anatomy, sharp silhouette readability, and uncluttered panel design. The movement and combat rhythm should be instantly understandable.

Constraints:
Avoid heavy painterly texture, excessive shading, paper dirt, rough sketch mess, woodblock-like grunge, over-rendered backgrounds, sci-fi armor, pastel rendering, and color-heavy treatments.

Best suited for:
wuxia combat, fast-paced duels, heroic tension, dramatic sparse pages, martial arts storytelling.""",
    ),
    "guochao_chibi": ComicStylePreset(
        id="guochao_chibi",
        label_zh="国潮Q版漫画",
        label_en="Guochao Chibi Comic",
        best_for="日常、搞笑、治愈剧情",
        base_prompt="""Style name: Clean Guochao Chibi Comic / 国潮Q版漫画.

Create a clean, cute, highly readable vertical webtoon-style comic panel in a guochao chibi aesthetic.

Core visual language:
A playful Chinese pop-culture chibi comic style with friendly traditional Chinese motifs, expressive faces, soft shapes, and a warm cheerful mood.

Line and texture:
Use soft rounded lineart, simplified forms, cute short proportions, and clear facial expression design. Keep the linework clean, smooth, and easy to read.

Color:
Use bright pastel colors, warm cheerful tones, clean flat fills, and simple soft shading. Colors should feel fresh and lively, not noisy or over-textured.

Composition:
Use a modern vertical webtoon layout, clean speech-bubble-ready spacing, simple decorative Chinese motifs, fluffy clouds, and lightweight environmental elements. Keep the character expression and comedic rhythm as the focus.

Rendering rules:
Maintain maximum clarity, simple backgrounds, clean silhouette shapes, and a friendly commercial webcomic finish. Decorative elements should be cute and supportive, not dense or visually busy.

Constraints:
Avoid horror realism, gloomy desaturated lighting, long realistic proportions, cluttered detail, muddy shading, noisy texture overlays, and overly complex backgrounds.

Best suited for:
daily life, comedy, healing stories, mascot-like moments, light fantasy, cute social-media-friendly comic panels.""",
    ),
    "dark_gothic": ComicStylePreset(
        id="dark_gothic",
        label_zh="暗黑志怪风漫画",
        label_en="Dark Chinese Gothic",
        best_for="悬疑、志怪、克苏鲁式奇幻",
        base_prompt="""Style name: Clean Dark Chinese Gothic Comic / 暗黑志怪风漫画.

Create a clean, high-contrast horror manhua panel with a dark Chinese gothic atmosphere inspired by zhiguai folklore, Taoist and Buddhist ritual imagery, and supernatural dread.

Core visual language:
A Chinese folklore horror comic style built from temple shadows, talismans, ritual objects, ominous silhouettes, supernatural creatures, and oppressive atmosphere.

Line and texture:
Use sharp linework, controlled roughness, strong black shapes, and restrained texture accents. Texture should be sparse and atmospheric, never dirty or overwhelming. Smoke, ritual marks, paper talismans, and grunge effects should remain decorative and secondary.

Color:
Use deep blacks, cold grays, and restrained blood-red accents only. Keep the palette controlled and high-contrast.

Composition:
Use dramatic chiaroscuro, oppressive negative space, eerie framing, and clearly readable supernatural silhouettes. The horror should come from composition, lighting, symbolism, and silhouette design rather than from visual noise.

Rendering rules:
Maintain clean panel borders, readable faces, clear anatomy, strong silhouette separation, and controlled shadow placement. Key characters, hands, weapons, and monster forms must remain readable.

Constraints:
Avoid muddy darkness, excessive grunge, chaotic cross-hatching, dirty texture noise, overfilled ritual details, blurred focal subjects, and messy unreadable horror effects. Avoid cheerful pastel tones, mascot-like cuteness, or sterile clean sci-fi environments.

Best suited for:
mystery, folklore horror, monsters, temples, occult fantasy, eerie ritual scenes, suspenseful supernatural comics.""",
    ),
    "exquisite_3d_donghua": ComicStylePreset(
        id="exquisite_3d_donghua",
        label_zh="国风3D精美动漫",
        label_en="Exquisite 3D Donghua Style",
        best_for="仙侠、古装奇幻、史诗动作",
        base_prompt="""Style name: Clean Exquisite 3D Donghua Comic / 国风3D精美动漫.

Create a clean, premium comic panel inspired by high-budget Chinese 3D donghua aesthetics, adapted for strong comic readability.

Core visual language:
A polished 3D donghua-inspired anime look with expressive faces, glossy eyes, elegant traditional Chinese costumes, cinematic beauty, and premium fantasy presentation.

Rendering:
Use refined cel-shaded 3D-inspired rendering with polished surfaces, expressive faces, smooth skin treatment, flowing hair, and detailed but controlled costume design. The result should feel premium and cinematic, not game-like or plastic.

Lighting and atmosphere:
Use soft cinematic lighting, gentle rim light, subtle atmospheric depth, and a poetic mood. Fog, depth of field, and volumetric effects must remain light and secondary, mainly in the background, and must never reduce subject clarity.

Costume and setting:
Use detailed traditional Chinese costumes, elegant flowing fabrics, tasteful embroidery, ornate ancient architecture, misty mountains, temples, palaces, clouds, and water motifs when appropriate. Environmental detail should support the subject, not clutter the frame.

Composition:
Use cinematic camera angles, clean panel composition, crisp comic borders, readable action staging, and strong silhouette clarity.

Rendering rules:
Maintain sharp character focus, clear facial readability, controlled detail density, and a polished premium finish. Characters must remain crisp and separated from the background.

Constraints:
Avoid cheap mobile-game rendering, waxy plastic skin, oversaturated clutter, noisy background detail, heavy blur, fog covering faces, unclear action staging, and flat lifeless lighting. Avoid western medieval armor unless explicitly requested.

Best suited for:
xianxia, ancient fantasy adventure, palace drama, poetic action, premium character closeups, epic fantasy comic panels.""",
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
