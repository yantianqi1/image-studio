export type XiaohongshuAvatarPosterPromptInput = Readonly<{
  characterNote: string;
}>;

const DEFAULT_CHARACTER_NOTE = "延续头像里的风格";

const REFERENCE_LINE = "【参考图】= 使用上传的小红书个人主页截图作为真实手机界面参考，保留手机屏幕中的个人主页界面、头像区域和红色小红书视觉元素。";

const XIAOHONGSHU_AVATAR_POSTER_TEMPLATE = `---

基于【参考图】中的小红书个人主页截图，创作一张头像拟人化视觉海报。

画面左侧是一部倾斜的手机，手机屏幕中清晰保留原始个人主页界面结构、头像区域、资料信息布局和红色小红书视觉元素。右侧是从头像中走出来的全身卡通人物，人物形象需要延续头像里的风格，并优先遵循【全身卡通人物】中的补充设定。

人物与手机屏幕自然融合，像是从虚拟账号中走进现实世界。人物身体应与头像区域形成明确视觉连接，边缘过渡自然，有强立体感和空间纵深。

人物右半边身体逐渐碎裂成黑色墨点、灰色碎片和红色小点，形成强烈的消散效果。碎裂方向、颗粒大小和密度需要有层次，不要平均铺散；黑色墨点、灰色碎片和红色小点之间要形成干净有力的视觉节奏。

整体风格为黑白漫画线稿 + 真实手机UI + 潮流视觉海报。背景为白色，画面干净、高级、有冲击力，构图具有杂志海报感。真实手机UI需要保持可辨识但不要喧宾夺主，卡通人物需要成为视觉焦点。

细节要求：线稿清晰，人物轮廓准确，服装和发型细节丰富，手机透视自然，红色视觉元素克制点缀，碎裂粒子有动态张力，整体画面完成度高。`;

export function buildXiaohongshuAvatarPosterPrompt(input: XiaohongshuAvatarPosterPromptInput) {
  const characterNote = input.characterNote.trim() || DEFAULT_CHARACTER_NOTE;
  const characterLine = `【全身卡通人物】= {${characterNote}}`;
  return [REFERENCE_LINE, characterLine, XIAOHONGSHU_AVATAR_POSTER_TEMPLATE].join("\n\n");
}
