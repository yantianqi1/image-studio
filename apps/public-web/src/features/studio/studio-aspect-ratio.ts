export type ResolutionOption = Readonly<{
  value: string;
  label: string;
  pixels: string;
}>;

export type AspectRatioOption = Readonly<{
  value: string;
  label: string;
  description: string;
  resolutions: readonly ResolutionOption[];
}>;

export const ASPECT_RATIO_OPTIONS: readonly AspectRatioOption[] = [
  {
    value: "1:1",
    label: "1:1",
    description: "正方形",
    resolutions: [
      { value: "1024x1024", label: "标准", pixels: "1024×1024" },
      { value: "1536x1536", label: "高清", pixels: "1536×1536" },
      { value: "2048x2048", label: "2K", pixels: "2048×2048" },
      { value: "4096x4096", label: "4K", pixels: "4096×4096" },
    ],
  },
  {
    value: "3:2",
    label: "3:2",
    description: "横版",
    resolutions: [
      { value: "1152x768", label: "标准", pixels: "1152×768" },
      { value: "1728x1152", label: "高清", pixels: "1728×1152" },
      { value: "2304x1536", label: "2K", pixels: "2304×1536" },
      { value: "4096x2736", label: "4K", pixels: "4096×2736" },
    ],
  },
  {
    value: "16:9",
    label: "16:9",
    description: "宽屏",
    resolutions: [
      { value: "1280x720", label: "标准", pixels: "1280×720" },
      { value: "1920x1080", label: "高清", pixels: "1920×1080" },
      { value: "2560x1440", label: "2K", pixels: "2560×1440" },
      { value: "3840x2160", label: "4K", pixels: "3840×2160" },
    ],
  },
  {
    value: "21:9",
    label: "21:9",
    description: "超宽",
    resolutions: [
      { value: "1344x576", label: "标准", pixels: "1344×576" },
      { value: "2016x864", label: "高清", pixels: "2016×864" },
      { value: "2688x1152", label: "2K", pixels: "2688×1152" },
      { value: "3840x1644", label: "4K", pixels: "3840×1644" },
    ],
  },
  {
    value: "9:16",
    label: "9:16",
    description: "竖屏",
    resolutions: [
      { value: "720x1280", label: "标准", pixels: "720×1280" },
      { value: "1080x1920", label: "高清", pixels: "1080×1920" },
      { value: "1440x2560", label: "2K", pixels: "1440×2560" },
      { value: "2160x3840", label: "4K", pixels: "2160×3840" },
    ],
  },
  {
    value: "4:3",
    label: "4:3",
    description: "标准",
    resolutions: [
      { value: "1024x768", label: "标准", pixels: "1024×768" },
      { value: "1600x1200", label: "高清", pixels: "1600×1200" },
      { value: "2048x1536", label: "2K", pixels: "2048×1536" },
      { value: "4096x3072", label: "4K", pixels: "4096×3072" },
    ],
  },
  {
    value: "3:4",
    label: "3:4",
    description: "竖图",
    resolutions: [
      { value: "768x1024", label: "标准", pixels: "768×1024" },
      { value: "1200x1600", label: "高清", pixels: "1200×1600" },
      { value: "1536x2048", label: "2K", pixels: "1536×2048" },
      { value: "3072x4096", label: "4K", pixels: "3072×4096" },
    ],
  },
] as const;

export const DEFAULT_RESOLUTION = "1024x1024";
