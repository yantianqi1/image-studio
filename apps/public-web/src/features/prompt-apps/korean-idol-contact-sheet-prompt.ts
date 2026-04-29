export type KoreanIdolContactSheetPromptInput = Readonly<{
  hasReferenceImage: boolean;
  note: string;
}>;

const REFERENCE_LINE = "【参考图】= 使用上传图片中的同一位成年女性人物作为九张照片唯一身份参考。";
const ORIGINAL_IDENTITY_LINE = "【参考图】= 未上传参考图，生成一个原创成年韩系女性偶像人物，并在九张照片中保持同一身份。";

const KOREAN_IDOL_CONTACT_SHEET_TEMPLATE = `---

Create a 9:16 vertical image: a 3x3 grid collage (nine images) forming an adult Korean female idol portrait photoshoot series.

Each frame features the same adult Korean female idol identity, maintaining 100% consistency in facial features, hairstyle, hair color, makeup style, skin tone, and overall identity across all nine images.

Each photo showcases a different pose, expression, camera angle, and subtle outfit variation while preserving one coherent styling system: the same white oversized button-up shirt, worn in modest editorial variations such as buttoned, cuffed sleeves, loose collar, half-tuck, layered over a simple inner top, seated drape, leaning pose, close portrait, and relaxed standing portrait.

Use natural window light, a soft and airy aesthetic, minimal clean indoor background, authentic film-like color grading with gentle pastel tones, and refined editorial photography style.

The collage should look like a professional photoshoot contact sheet or Instagram carousel layout. Keep clean spacing between the nine frames, consistent color grading, and cohesive visual rhythm.

Soft focus, slight grain, warm highlights, gentle shadows, natural skin texture, elegant posing, quiet mood, polished commercial portrait finish.

Extremely consistent identity across all frames while showing range in posing and mood. Avoid revealing styling, lingerie cues, school uniforms, childish styling, exaggerated glamour retouching, distorted hands, inconsistent faces, duplicate expressions, cluttered rooms, harsh flash, and text overlays.`;

export function buildKoreanIdolContactSheetPrompt(input: KoreanIdolContactSheetPromptInput) {
  const note = input.note.trim();
  const referenceLine = input.hasReferenceImage ? REFERENCE_LINE : ORIGINAL_IDENTITY_LINE;
  const noteLine = note ? `【备注】= {${note}}` : "";
  return [referenceLine, noteLine, KOREAN_IDOL_CONTACT_SHEET_TEMPLATE].filter(Boolean).join("\n\n");
}
