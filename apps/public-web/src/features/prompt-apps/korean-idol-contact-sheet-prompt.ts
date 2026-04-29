export type KoreanIdolContactSheetPromptInput = Readonly<{
  hasReferenceImage: boolean;
  note: string;
}>;

const REFERENCE_LINE = "【参考图】= 使用上传图片中的同一位成年人物作为九张照片唯一身份参考；严格遵循参考图中的人物身份、服装、发型、妆容、配饰和整体气质，不要替换为固定服装模板。";
const ORIGINAL_IDENTITY_LINE = "【参考图】= 未上传参考图，生成一个原创成年韩系女性偶像人物，并在九张照片中保持同一身份。";

const KOREAN_IDOL_CONTACT_SHEET_TEMPLATE = `---

Create a 9:16 vertical image: a 3x3 grid collage (nine images) forming an adult Korean idol editorial portrait photoshoot series.

Each frame features the same adult person identity, maintaining 100% consistency in facial features, hairstyle, hair color, makeup style, skin tone, clothing logic, accessories, and overall identity across all nine images.

If a reference image is provided, preserve the referenced outfit and styling system as the primary design source. Only vary pose, expression, camera angle, framing, body language, and subtle editorial arrangement; do not redesign the clothes into a preset outfit.

If no reference image is provided, create an original adult Korean female idol styling system with modest contemporary fashion, cohesive color coordination, and natural editorial polish.

Use natural window light, a soft and airy aesthetic, minimal clean indoor background, authentic film-like color grading with gentle pastel tones, and refined editorial photography style.

The collage should look like a professional photoshoot contact sheet or Instagram carousel layout. Keep clean spacing between the nine frames, consistent color grading, and cohesive visual rhythm.

Soft focus, slight grain, warm highlights, gentle shadows, natural skin texture, elegant posing, quiet mood, polished commercial portrait finish.

Extremely consistent identity across all frames while showing range in posing and mood. 用户备注优先于默认风格描述; follow any user note about outfit, mood, scene, lens, or color grading unless it conflicts with the reference identity. Avoid revealing styling, lingerie cues, school uniforms, childish styling, exaggerated glamour retouching, distorted hands, inconsistent faces, duplicate expressions, cluttered rooms, harsh flash, and text overlays.`;

export function buildKoreanIdolContactSheetPrompt(input: KoreanIdolContactSheetPromptInput) {
  const note = input.note.trim();
  const referenceLine = input.hasReferenceImage ? REFERENCE_LINE : ORIGINAL_IDENTITY_LINE;
  const noteLine = note ? `【备注】= {${note}}` : "";
  return [referenceLine, noteLine, KOREAN_IDOL_CONTACT_SHEET_TEMPLATE].filter(Boolean).join("\n\n");
}
