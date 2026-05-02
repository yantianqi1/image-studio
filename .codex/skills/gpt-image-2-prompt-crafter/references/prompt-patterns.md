# Prompt Patterns

This reference distills the local `prompts_data.json` collection: 1378 A-grade prompts across photography, portraits, posters, UI mockups, infographics, product visuals, character sheets, 3D scenes, comics, and image-editing templates. The strongest prompts rely on positive, concrete visual direction.

## Universal Anatomy

Use this order for most new-image prompts:

1. Intent and medium: photo, poster, app screenshot, infographic, character sheet, packaging ad, game screenshot, comic page, 3D render.
2. Subject: who or what appears, count, identity, pose, action, expression, wardrobe, product role.
3. Scene: location, background, foreground, props, spatial relationships, object placement.
4. Composition: camera angle, shot size, framing, grid/panel structure, symmetry/asymmetry, open space, aspect ratio.
5. Visual system: style, genre, era, material, surface detail, print/digital treatment.
6. Light and color: light source, contrast, palette, grading, haze, bloom, grain, reflection.
7. Text and labels: exact copy, language, placement, font style, readability, hierarchy.
8. Constraints: preserve, replace only, no unrelated additions, consistency requirements.

## Creative Divergence Pass

Use this pass before drafting when the request is short, broad, or aesthetic-heavy. The goal is to translate what the user cannot easily verbalize into concrete image ideas.

1. Generate 2-3 distinct visual directions internally, each with a different scene, mood, styling, camera language, and light.
2. Choose the strongest direction for a single-prompt answer, or output all directions when variety would better serve the user.
3. Make every direction visibly different. Do not create near-duplicates that only swap colors or adjectives.
4. Keep the user's core subject intact while expanding the surrounding visual world.

Useful divergence axes:
- scene archetype: rooftop after rain, quiet hotel corridor, coastal morning, subway platform, old-money residence, editorial studio, garden greenhouse, night market, desert roadside, art museum
- spatial anchor: elevator doors, wet pavement reflections, linen curtains, marble wall, vending machine glow, window shadows, chrome handrail, sea mist, backlit foliage
- face aesthetic: pure natural Asian face, soft sweet college look, fresh first-love look, clean editorial beauty, gentle girl-next-door, cool mature beauty, sharp runway face
- wardrobe family: silk slip dress, tailored suit, knit set, trench coat, minimal evening dress, leather jacket, resort wear, monochrome editorial styling
- camera language: close portrait, waist-up, seven-eighths body, full body, low-angle runway feel, candid side profile, mirror reflection, foreground-framed shot
- lighting signature: golden-hour rim light, neon bounce, cloudy softbox sky, hard flash, warm practical lamps, low-key studio strip light, dappled sunlight
- emotional tone: serene, cinematic, aloof, intimate, energetic, mysterious, luxurious, natural, rebellious

Scene formula:
`{environment archetype} + {time/weather} + {spatial anchor} + {surface/material detail} + {light behavior} + {background depth}`.

Example: "rainy neon street" becomes "a narrow Tokyo side street after rain, wet asphalt reflecting magenta signage, a chrome vending machine glowing in the midground, transparent umbrellas crossing as soft silhouettes, shallow background depth with blue haze".

## Default Skeletons

### New Image

```text
生成一张{画面类型}：主体是{主体}，正在{动作/状态}，位于{环境}。
构图为{镜头/角度/版式}，主体位于{位置}，背景包含{关键元素}。
风格为{视觉风格/媒介}，使用{色彩方案}，光线为{光源和方向}，材质细节包括{材质/纹理}。
画面氛围是{情绪}，{比例/清晰度/真实感要求}。
```

### Human-Subject Photography

Use this structure when the request centers on a person, model, portrait, fashion shoot, street photo, lifestyle photo, celebrity-style image, or realistic character photo. Keep every paragraph concrete and visual; do not collapse it into one generic sentence.

For short prompts such as "漂亮亚洲女孩模特", first create contrasting editorial directions. Avoid reusing the same fixed stack of white suit, glass facade, 85mm lens, shallow depth, and generic city background unless the user requests that look. Vary at least four of these elements: face aesthetic, environment, wardrobe, pose, camera height, lens feel, light source, color grade, foreground object, and narrative moment.

If the user says the face should be better, prettier, more pure, more youthful, or more "清纯", prioritize a face-first prompt. Use one close or medium-close framing option when variety is requested so the generator has enough facial pixels to resolve the face.

```text
生成一张{镜头距离/画面类型}实拍照片，捕捉{成年人物身份}在{创意场景组合}中的{动作/情绪/瞬间}，背景呈现{虚化/层次/环境可辨识度}。

脸部审美锚点：{清纯自然/甜美初恋感/干净高级/冷艳成熟/其他审美方向}，{脸型和面部比例}，{眼型、眉形、卧蚕或眼神}，{鼻梁和鼻尖形态}，{唇形和唇色}，{皮肤质感和妆感}，{发型、发色、发丝状态}，{表情强度}。

主体位于{前景/中景/画面位置}，采用{平视/低机位/高机位/侧面/正面微侧}镜头。人物呈现{站姿/坐姿/行走/转身/倚靠/动态姿态}，{头部角度/视线方向/手臂与腿部动作}，整体姿态传达{气质/状态/张力}。

人物外貌细节：{脸部轮廓、颧骨、下颌线、面中立体度}，{眉眼间距、眼神方向、睫毛和眼下光影}，{唇峰、嘴角状态、肤色过渡}以真实摄影方式呈现，避免塑料感和过度磨皮。

服装与配饰：{上装/外套/下装/鞋履/包袋/首饰/道具}，写清{材质、剪裁、层次、褶皱、贴合度、颜色关系}，用时尚摄影语言描述身体线条与比例。

灯光效果说明：{主光方向/光质/阴影位置/高光边缘/反射/环境光}，光线与人物面部、发丝、服装材质产生真实互动。

拍摄角度解析：{镜头高度/焦段感/景深/透视效果}，说明该角度如何影响{气场、比例、面部轮廓、动态感}。

构图风格要素：{引导线/前景框架/留白/对称或非对称/背景元素位置}，让视线自然集中到人物。

背景环境：{环境母题 + 时间/天气 + 空间锚点 + 材质细节 + 光线行为}，保留{可辨识环境细节}，并通过{虚化程度/色彩层次/空间纵深}形成生活感或叙事感。

整体色彩与质感：{冷暖色调/胶片感/杂志感/商业写真感/自然纪实感}，皮肤、布料、金属、玻璃、路面或墙面等材质保持真实细节。
```

Face detail recipes:
- 清纯自然亚洲脸: adult woman, soft oval or small heart-shaped face, balanced facial thirds, clear almond eyes, natural straight brows, subtle lower-eyelid highlight, delicate straight nose bridge, soft rounded nose tip, lightly defined lips, transparent natural base makeup, faint peach blush, sheer pink lip tint, soft black or dark-brown hair, calm gentle expression.
- 甜美初恋感: adult woman, slightly fuller cheeks, bright eyes, soft smile, airy bangs or loose side strands, warm daylight on the face, pale knitwear or cotton textures, low contrast color grade.
- 干净高级脸: adult woman, smoother facial outline, neat brows, controlled expression, precise hair shape, matte skin with visible texture, simple jewelry, neutral wardrobe, soft studio or window light.
- 冷艳成熟脸: sharper cheekbones, stronger brows, defined eyeliner, muted lip color, straighter posture, darker wardrobe, higher contrast light. Use only when requested, because it conflicts with "清纯".

### Image Edit or Reference-Based Prompt

```text
Image 1: {要保留的主体/原图}
Image 2: {参考物/风格/服装/产品}

{编辑动作}。保留 Image 1 中的{必须保持项}。
只替换/新增{变化项}，不要改变{禁止改变项}。
让新增内容拥有真实的{阴影/遮挡/反射/材质/透视}，与原图的{光线/镜头/色彩/清晰度}一致。
```

### Text-Heavy Design

```text
生成一张{载体}，主题为"{主题}"。
主标题文字必须是"{精确文字}"，位于{位置}，字体为{字体气质}。
版式包含{信息区块/图表/标签/图标}，阅读层级清晰。
背景、色彩、装饰、留白和材质遵循{设计风格}，所有文字清晰可读。
```

### Multi-Panel or Character Sheet

```text
创建一张{行列数}的{角色/场景/表情/分镜}网格。
所有面板保持{人物身份/比例/服装/镜头距离/风格}一致。
每格内容依次为：1. {内容}; 2. {内容}; ...
布局为{边框/无边框/蓝图/杂志跨页}，整体风格为{风格}。
```

## Category Modules

### Photography and Portrait

Emphasize camera realism: shot type, focal length feel, lens softness, natural skin texture, light direction, background blur, grain, slight imperfection, and body language. Use restraint; photorealism improves when details are physical rather than promotional.

For people-centered photography, use the Human-Subject Photography skeleton above. Infer missing details from genre and setting instead of staying vague: pose, gaze, hands, hair, makeup, clothing material, light direction, camera height, foreground/background, and color grade. If the prompt includes words like "girl", "young", "beautiful", "body", "model", "fashion", or "photoshoot", describe the subject as an adult model and keep the styling editorial rather than explicit.

Useful blocks:
- framing: close-up, medium shot, seven-eighths body, full body, eye-level, overhead, 3/4 view
- light: soft side light, golden hour backlight, studio softbox, rim light, low-key contrast
- realism: pores, fabric weave, hair strands, contact shadows, imperfect candid framing
- face-first prompts: use close-up, medium close-up, or seven-eighths body with a readable face when the user cares about facial beauty; specify eyelight, catchlight, skin texture, brows, lips, and hair strands
- pure-face safeguards: keep makeup light, expression gentle, wardrobe clean, colors fresh, and camera close enough for facial detail; avoid heavy contour, nightclub lighting, aggressive poses, and overly mature styling unless requested
- diversity check: before finalizing, confirm the prompt is not just a rephrased version of a previous common default; the background, wardrobe, pose, and light should form a specific new visual idea

### Product Visual and Packaging

Protect product identity first. Specify product placement, material, condensation, reflections, labels, hero angle, background, commercial lighting, and what surrounding elements remain. For edits, state "replace only" and list preserved geometry, shadows, reflections, camera angle, and background objects.

### Poster, Comic, and Magazine Layout

Define print format, title placement, typography, badges, issue boxes, panels, borders, paper texture, halftone dots, speed lines, stickers, and reading hierarchy. For dense posters, describe radial order, rows, rings, or zones so the model can allocate space.

### UI Mockup and App Screenshot

Describe it as a real screenshot first. Specify device orientation, OS style, navigation bar, icons, widgets, cards, message bubbles, data visualization, exact labels, spacing, and background. Use exact text strings for every visible label that matters.

### Infographic and Diagram

State the information architecture: title, sections, callouts, arrows, legends, charts, maps, timelines, icons, and labels. Use fewer core claims when text accuracy matters. Require clear readable labels and clean hierarchy.

### Character Illustration and Character Sheet

Separate identity from variation. Lock face, hair, outfit, proportions, and design language; vary only expression, pose, view, outfit, or action as requested. For sheets, define rows, views, expression list, detail callouts, color palette, and white/blueprint background.

### 3D Scene, Game Scene, and Concept Art

Specify render language: in-game screenshot, cinematic concept art, orthographic blueprint, collectible toy, paper quilling, diorama, or engine footage. Add camera angle, scale, world materials, environmental storytelling, UI overlay if present, and consistent design language.

### Text Rendering

Keep the number of exact text elements realistic. Put every required text string in quotes. State language, type style, alignment, hierarchy, and whether text is printed, handwritten, engraved, glowing, or UI-rendered.

## Variable Conventions

- Use `{城市名}`, `{产品名}`, `{角色名}`, `{品牌名}`, `{文字内容}` for reusable templates.
- Use `【用户替换项】` only for short one-shot Chinese prompts where quick manual replacement is more natural.
- Define variables after the prompt when there are three or more placeholders.

## Constraint Guidance

Generated answers should use only the output sections defined in `SKILL.md`. Put avoidance requirements into the main prompt as positive, concrete constraints:

- product images: specify clean packaging, visible brand placement, and no unrelated printed elements only when relevant
- character consistency tasks: specify preserved identity, stable anatomy, and consistent pose scale
- organic collages: specify seamless overlap, natural spacing, and no visible panel borders
- image editing: specify exactly which objects, lighting, pose, background, and composition remain unchanged

## Final Checklist

- The first line tells the model exactly what to create.
- The subject count and placement are unambiguous.
- Human face prompts include concrete face shape, eyes, brows, nose, lips, skin texture, hair, expression, and lighting on the face.
- "清纯" prompts remain natural, adult, soft, lightly made up, and non-seductive.
- Camera, composition, or layout is specified.
- Lighting, color, material, and texture are visible, not abstract.
- Text requirements are quoted and placed.
- Reference-image preservation rules are explicit.
- No contradictory style stack is present.
- The prompt can be pasted directly into an image model without extra explanation.
