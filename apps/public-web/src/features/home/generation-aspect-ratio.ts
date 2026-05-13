export type AspectRatioOption = Readonly<{
  value: string;
  label: string;
  description: string;
}>;

export const ASPECT_RATIO_OPTIONS: readonly AspectRatioOption[] = [
  {
    value: "1:1",
    label: "1:1",
    description: "正方形",
  },
  {
    value: "3:2",
    label: "3:2",
    description: "横版",
  },
  {
    value: "16:9",
    label: "16:9",
    description: "宽屏",
  },
  {
    value: "21:9",
    label: "21:9",
    description: "超宽",
  },
  {
    value: "9:16",
    label: "9:16",
    description: "竖屏",
  },
  {
    value: "4:3",
    label: "4:3",
    description: "标准",
  },
  {
    value: "3:4",
    label: "3:4",
    description: "竖图",
  },
] as const;
