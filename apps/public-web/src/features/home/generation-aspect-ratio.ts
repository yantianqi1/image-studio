export type AspectRatioOption = Readonly<{
  value: string;
  label: string;
  description: string;
  promptInstruction: string;
}>;

export const ASPECT_RATIO_OPTIONS: readonly AspectRatioOption[] = [
  {
    value: "1:1",
    label: "1:1",
    description: "正方形",
    promptInstruction: "画面构图请适配 1:1 正方形比例，主体居中，四周留有均衡空间。",
  },
  {
    value: "16:9",
    label: "16:9",
    description: "横图",
    promptInstruction: "画面构图请适配 16:9 横向宽屏比例，横向空间充足，适合电影感宽画幅。",
  },
  {
    value: "9:16",
    label: "9:16",
    description: "竖图",
    promptInstruction: "画面构图请适配 9:16 竖向手机海报比例，主体纵向延展，适合全屏竖版展示。",
  },
  {
    value: "4:3",
    label: "4:3",
    description: "标准",
    promptInstruction: "画面构图请适配 4:3 标准横向比例，主体与环境保持自然平衡。",
  },
  {
    value: "3:4",
    label: "3:4",
    description: "竖图",
    promptInstruction: "画面构图请适配 3:4 竖向比例，主体完整清晰，保留适度背景层次。",
  },
] as const;

export function buildAspectRatioPrompt(prompt: string, aspectRatio: string) {
  const instruction = resolveAspectRatioInstruction(aspectRatio);
  const trimmedPrompt = prompt.trim();

  if (!instruction) {
    return trimmedPrompt;
  }

  return `${trimmedPrompt}\n\n尺寸与构图要求：${instruction}`;
}

export function resolveAspectRatioInstruction(aspectRatio: string) {
  return ASPECT_RATIO_OPTIONS.find((option) => option.value === aspectRatio)?.promptInstruction ?? "";
}
