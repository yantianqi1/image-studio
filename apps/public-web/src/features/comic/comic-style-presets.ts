export type ComicStylePresetId =
  | "ink_wash"
  | "gongbi"
  | "neo_chinese"
  | "baimiao"
  | "guochao_chibi"
  | "dark_gothic"
  | "exquisite_3d_donghua";

export type ComicStylePresetOption = Readonly<{
  id: ComicStylePresetId;
  labelZh: string;
  labelEn: string;
  bestFor: string;
}>;

export const DEFAULT_COMIC_STYLE_PRESET: ComicStylePresetId = "neo_chinese";

export const COMIC_STYLE_PRESETS: readonly ComicStylePresetOption[] = [
  { id: "ink_wash", labelZh: "水墨风漫画", labelEn: "Ink Wash Comic", bestFor: "仙侠、古风战斗" },
  { id: "gongbi", labelZh: "工笔重彩漫画", labelEn: "Meticulous Color Comic", bestFor: "宫廷、玄幻、历史" },
  { id: "neo_chinese", labelZh: "线性新国风漫画", labelEn: "Linear Neo-Chinese", bestFor: "现代商业插图" },
  { id: "baimiao", labelZh: "白描武侠漫画", labelEn: "Baimiao Line-art Comic", bestFor: "武侠、快节奏打斗" },
  { id: "guochao_chibi", labelZh: "国潮Q版漫画", labelEn: "Guochao Chibi Comic", bestFor: "日常、搞笑、治愈" },
  { id: "dark_gothic", labelZh: "暗黑志怪风漫画", labelEn: "Dark Chinese Gothic", bestFor: "悬疑、志怪奇幻" },
  { id: "exquisite_3d_donghua", labelZh: "国风3D精美动漫", labelEn: "Exquisite 3D Donghua Style", bestFor: "仙侠、古装奇幻、史诗动作" },
] as const;

export function getComicStylePreset(stylePresetId: ComicStylePresetId) {
  return COMIC_STYLE_PRESETS.find((item) => item.id === stylePresetId) ?? COMIC_STYLE_PRESETS[0];
}
