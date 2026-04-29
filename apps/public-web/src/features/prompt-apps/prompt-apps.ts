export type { CityPosterPromptInput } from "./city-poster-prompt";
export { buildCityPosterPrompt } from "./city-poster-prompt";
export type { KoreanIdolContactSheetPromptInput } from "./korean-idol-contact-sheet-prompt";
export { buildKoreanIdolContactSheetPrompt } from "./korean-idol-contact-sheet-prompt";
export type { SongPoemScenePromptInput } from "./song-poem-scene-prompt";
export { buildSongPoemScenePrompt } from "./song-poem-scene-prompt";

export type PromptApp = Readonly<{
  access: "public-image-job-api";
  cover: PromptAppCover;
  id: string;
  title: string;
  description: string;
  href: string;
  statusLabel: string;
}>;

export type PromptAppCover = Readonly<{
  aspectRatio?: "3:4" | "9:16";
  badge: string;
  imageSrc: string;
  label: string;
}>;

export type CharacterPosterPromptInput = Readonly<{
  character: string;
  note: string;
}>;

export type EncyclopediaCardPromptInput = Readonly<{
  note: string;
  topic: string;
}>;

export type SilhouetteUniversePosterPromptInput = Readonly<{
  note: string;
  topic: string;
}>;

export const PROMPT_APPS: readonly PromptApp[] = [
  {
    access: "public-image-job-api",
    id: "character-poster",
    cover: {
      badge: "海报",
      imageSrc: "/app-covers/character-poster-hutao.png",
      label: "角色海报",
    },
    title: "角色海报",
    description: "输入角色与备注，生成二次元动漫插画海报。",
    href: "/apps/character-poster",
    statusLabel: "内置提示词",
  },
  {
    access: "public-image-job-api",
    id: "encyclopedia-card",
    cover: {
      aspectRatio: "3:4",
      badge: "百科",
      imageSrc: "/app-covers/encyclopedia-card-hajimi.png",
      label: "科普百科图",
    },
    title: "科普百科图",
    description: "输入主题词，生成竖版模块化科普信息图。",
    href: "/apps/encyclopedia-card",
    statusLabel: "内置提示词",
  },
  {
    access: "public-image-job-api",
    id: "silhouette-universe-poster",
    cover: {
      aspectRatio: "3:4",
      badge: "收藏",
      imageSrc: "/app-covers/silhouette-universe-poster.png",
      label: "轮廓宇宙海报",
    },
    title: "轮廓宇宙海报",
    description: "输入主题，生成具有象征轮廓与叙事世界的收藏版海报。",
    href: "/apps/silhouette-universe-poster",
    statusLabel: "内置提示词",
  },
  {
    access: "public-image-job-api",
    id: "korean-idol-contact-sheet",
    cover: {
      aspectRatio: "9:16",
      badge: "写真",
      imageSrc: "/app-covers/korean-idol-contact-sheet.png",
      label: "韩系偶像九宫格",
    },
    title: "韩系偶像九宫格",
    description: "可上传参考图，生成韩系偶像九宫格写真拼图。",
    href: "/apps/korean-idol-contact-sheet",
    statusLabel: "内置提示词",
  },
  {
    access: "public-image-job-api",
    id: "city-poster",
    cover: {
      aspectRatio: "9:16",
      badge: "城市",
      imageSrc: "/app-covers/city-poster.png",
      label: "城市宣传海报",
    },
    title: "城市宣传海报",
    description: "输入城市和备注，生成新春国潮城市宣传海报。",
    href: "/apps/city-poster",
    statusLabel: "内置提示词",
  },
  {
    access: "public-image-job-api",
    id: "song-poem-scene",
    cover: {
      badge: "宋词",
      imageSrc: "/app-covers/song-poem-scene.svg",
      label: "宋词双境图",
    },
    title: "宋词双境图",
    description: "输入对应小诗，生成墙内墙外分割的宋代诗意场景。",
    href: "/apps/song-poem-scene",
    statusLabel: "内置提示词",
  },
];

const CHARACTER_POSTER_TEMPLATE = `---

请根据【角色】自动检索该角色的原著作品名称、经典名场面、标志性动作姿态、服装配色与原著画风，并据此生成一张极致精美的二次元动漫插画海报。

【画面构成——双区域布局（16:9横版）】

◆ 左侧+中央区域（约占画面60%）：
  - 该角色的腰部以上半身特写，面向观众或微侧身，视线灵动自然。
  - 姿态与动作应完全契合角色性格与原著设定（如战斗型角色取攻击蓄力姿态；温柔型角色取优雅静谧姿态）。
  - 极致细腻地刻画：发丝光泽与飘动、眼眸虹彩层次与高光、皮肤质感与光影过渡、服饰纹理与配饰细节。
  - 背景为契合角色世界观的氛围渲染（光斑、粒子、色彩雾气等），与角色融为一体，不喧宾夺主。

◆ 右侧区域（约占画面40%）：
  - 同一角色的全身立像/动态画像，展现其最经典的「名场面」瞬间。
  - 全身画像与左侧半身像在色调和光照方向上保持和谐统一。
  - 该画像可带有轻微的发光描边或虚化过渡，使其自然嵌入整体画面。

最后是文字排版，请生成中文文字。字体要有与原著风格匹配的设计感。自动检索并排版一句原著中关于该场景的经典描写或台词写在画面左边底部，和字幕一样，在画面左上角写上该作品名称，像图标一样。字体使用优雅的衬线体。整体布局要完美融入画面，字体内没有背景。

【整体画面要求】
- 风格：忠实于原著画风的高品质二次元动漫插画，笔触细腻如同官方原画级别。
- 色调：根据角色主题自动适配（暖色系/冷色系/对比色系）。
- 画质：4K超高清（3840×2160），无噪点、无伪影。
- 构图：纯净、宏大、呼吸感充足，留白与元素分布平衡。
- 整体画面应具备可直接用作壁纸或海报的完成度。`;

export function buildCharacterPosterPrompt(input: CharacterPosterPromptInput) {
  const character = input.character.trim();
  const note = input.note.trim();
  const roleLine = note ? `【角色】= {${character}}（${note}）` : `【角色】= {${character}}`;
  return `${roleLine}\n\n${CHARACTER_POSTER_TEMPLATE}`;
}

const ENCYCLOPEDIA_CARD_TEMPLATE = `---

请根据【主题】生成一张高质量竖版「科普百科图」。

这张图不是普通海报,也不是单纯插画,而是一张兼具“图鉴感、百科感、信息结构感、收藏感”的模块化科普信息图。整体风格参考高级博物图鉴、现代百科书页、生活方式知识卡和社交媒体高传播信息图的结合。

请让画面包含:

一个清晰漂亮的主题主视觉
若干局部特征放大细节
多个圆角模块化信息分区
清楚的标题层级与重点标签
简洁但丰富的百科内容
可视化评分、要点总结或Top 5模块

内容栏目请根据主题自动适配,优先从这些方向中选择并合理组合:
基础档案、分类信息、外观特征、习性/生态、形成机制/结构组成、生长或使用条件、养护或维护建议、风险与注意事项、适合人群或适用场景、优缺点对比、快速评分卡。

视觉要求:
浅色干净背景,柔和配色,轻阴影,精致小图标,圆角信息框,整洁排版,信息密度高但不拥挤,阅读体验好。整体必须像真正可以发布、阅读、收藏、系列化生产的科普百科卡,而不是广告图。

请不要做成普通商业宣传海报。要突出“知识整理 + 模块信息 + 图鉴式展示”的特征。`;

export function buildEncyclopediaCardPrompt(input: EncyclopediaCardPromptInput) {
  const topic = input.topic.trim();
  const note = input.note.trim();
  const topicLine = note ? `【主题】= {${topic}}（${note}）` : `【主题】= {${topic}}`;
  return `${topicLine}\n\n${ENCYCLOPEDIA_CARD_TEMPLATE}`;
}

const SILHOUETTE_UNIVERSE_POSTER_TEMPLATE = `---

请根据【主题】自动生成一张高审美的“轮廓宇宙 / 收藏版叙事海报”风格作品。

不要将画面局限于固定器物或常见容器，不要优先默认瓶子、沙漏、玻璃罩、怀表之类的常规载体，而是由 AI 根据主题自行判断并选择一个最契合、最有象征意义、轮廓最强、最适合承载完整叙事世界的主轮廓载体。

这个主轮廓可以是器物、建筑、门、塔、拱门、穹顶、楼梯井、长廊、雕像、侧脸、眼睛、手掌、头骨、羽翼、面具、镜面、王座、圆环、裂缝、光幕、阴影、几何结构、空间切面、舞台框景、抽象符号或其他更有创意与主题代表性的视觉轮廓，要求合理布局。

优先选择最能放大主题气质、最能形成强烈视觉记忆点、最能体现史诗感、神秘感、诗意感或设计感的轮廓，而不是最安全、最普通、最常见的容器。

画面的核心不是简单把世界装进某个物体里，而是让完整的主题世界自然生长在这个主轮廓之中、之内、之上、之边界里或与其结构融为一体，形成一种“主题宇宙依附于一个象征性轮廓展开”的高级叙事效果。

主轮廓必须清晰、优雅、有辨识度，并在整体构图中占据核心地位。轮廓内部或边界中需要自动生成与主题强绑定的完整叙事世界，内容应当丰富、饱满、层次清晰，包括最能代表主题的标志性场景、核心建筑或空间结构、象征符号与隐喻元素、角色关系或文明痕迹、远景中景近景的空间递进、具有命运感和情绪张力的氛围层次，以及门、台阶、桥梁、水面、烟雾、路径、光源、遗迹、机械结构、自然景观、抽象形态、生物或道具等叙事细节。

所有元素必须统一、自然、有主次、有层级地融合，像一个完整世界真实孕育在这个轮廓结构之中，而不是简单拼贴、裁切填充、素材堆叠或模板化背景。

整体构图需要具有强烈的收藏版海报气质与高级设计感，大结构稳定，主轮廓强烈明确，内部世界具有纵深、秩序和呼吸感，细节丰富但不拥挤，内容丰满但不杂乱，可以适度加入小比例人物剪影、远处建筑、光柱、门洞、桥、阶梯、回廊、倒影、天光或远景结构来增强尺度感、故事感与史诗感。

整体画面要安静、宏大、凝练、富有余味，不要平均铺满，不要廉价热闹，不要无重点堆砌。

风格融合收藏版电影海报构图、高级叙事型视觉设计、梦幻水彩质感与纸张印刷品气质，强调纸张颗粒感、边缘飞白、水彩刷痕、轻微晕染、空气透视、柔和雾化、局部体积光、光雾穿透、大面积留白与克制版式，让画面看起来像设计师完成的高端收藏版视觉作品，而不是普通 AI 跑图。

整体气质要高级、诗意、宏大、神圣、怀旧、安静、具有传说感和叙事感。

色彩由 AI 根据主题自动判断并匹配最合适的高级配色方案，但必须保持统一、克制、耐看、低饱和、高级，不要杂乱高饱和，不要廉价霓虹感，不要塑料数码感。

配色可以围绕黑金灰、冷蓝灰、雾白灰、褐红米白、暗铜、旧纸色、深海蓝、暮色紫、银灰等体系自由变化，但必须始终服务主题，并保持海报级审美与整体和谐。

最终要求：第一眼有强烈的主题识别度和轮廓记忆点，第二眼有完整丰富的叙事世界，第三眼仍有细节和余味。

轮廓选择必须具有创意和主题匹配度，尽量避免重复、保守、常见的容器套路，优先选择更有象征性、更有空间感、更有设计潜力的轮廓形式。

不要普通背景拼接，不要生硬裁切，不要模板化奇幻素材，不要游戏宣传图感，不要过度卡通化，不要过度写实导致失去艺术感，不要形式大于内容。

如果合适，可以自然加入低调克制的标题、编号、签名或落款，让它更像收藏版海报设计的一部分，但不要喧宾夺主。`;

export function buildSilhouetteUniversePosterPrompt(input: SilhouetteUniversePosterPromptInput) {
  const topic = input.topic.trim();
  const note = input.note.trim();
  const topicLine = note ? `【主题】= {${topic}}（${note}）` : `【主题】= {${topic}}`;
  return `${topicLine}\n\n${SILHOUETTE_UNIVERSE_POSTER_TEMPLATE}`;
}
