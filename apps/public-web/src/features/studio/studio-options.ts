export type { AspectRatioOption, ResolutionOption } from "@/features/studio/studio-aspect-ratio";
import { ASPECT_RATIO_OPTIONS as BASE_ASPECT_RATIO_OPTIONS } from "@/features/studio/studio-aspect-ratio";
import type { AspectRatioOption } from "@/features/studio/studio-aspect-ratio";

const AUTO_OPTION: AspectRatioOption = {
  value: "auto",
  label: "自动",
  description: "由模型自动选择",
  resolutions: [{ value: "auto", label: "自动", pixels: "自动" }],
};

export const ASPECT_RATIO_OPTIONS: readonly AspectRatioOption[] = [
  AUTO_OPTION,
  ...BASE_ASPECT_RATIO_OPTIONS,
];

export const QUALITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
] as const;

export type QualityOption = (typeof QUALITY_OPTIONS)[number];

export function findAspectRatio(value: string): AspectRatioOption | undefined {
  return ASPECT_RATIO_OPTIONS.find((o) => o.value === value);
}

export function findResolution(aspectRatio: string, resolution: string) {
  const ar = findAspectRatio(aspectRatio);
  if (!ar) return undefined;
  return ar.resolutions.find((r) => r.value === resolution);
}
