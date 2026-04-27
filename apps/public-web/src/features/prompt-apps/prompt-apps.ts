export type PromptApp = Readonly<{
  access: "public-image-job-api";
  id: string;
  title: string;
  description: string;
  href: string;
  statusLabel: string;
}>;

export type CharacterPosterPromptInput = Readonly<{
  character: string;
  note: string;
}>;

export const PROMPT_APPS: readonly PromptApp[] = [
  {
    access: "public-image-job-api",
    id: "character-poster",
    title: "角色海报",
    description: "输入角色与备注，生成二次元动漫插画海报。",
    href: "/apps/character-poster",
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
