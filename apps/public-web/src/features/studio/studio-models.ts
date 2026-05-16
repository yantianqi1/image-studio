import type { PublicModelSummary, PublicModelVariant } from "@/lib/public-api";
import {
  ASPECT_RATIO_OPTIONS as KNOWN_ASPECT_RATIO_OPTIONS,
  type AspectRatioOption,
  type ResolutionOption,
} from "@/features/studio/studio-aspect-ratio";

export function filterImageModels(models: readonly PublicModelSummary[]) {
  return models.filter(isRealImageModel);
}

export function resolveImageModel(
  models: readonly PublicModelSummary[],
  modelCode: string,
) {
  const imageModels = filterImageModels(models);
  const resolvedModelCode = imageModels.find((model) => model.code === modelCode)?.code ?? imageModels[0]?.code ?? "";
  const selectedModel = imageModels.find((model) => model.code === resolvedModelCode) ?? null;

  return { imageModels, resolvedModelCode, selectedModel };
}

function isRealImageModel(model: PublicModelSummary) {
  return model.capability === "image";
}

type ParameterSelection = Readonly<{
  aspectRatio: string;
  resolution: string;
  quality: string;
}>;

const QUALITY_ORDER = ["low", "medium", "high"] as const;

export function buildModelAspectRatioOptions(model: PublicModelSummary | null): readonly AspectRatioOption[] {
  const variants = sortVariants(model?.variants ?? []);
  if (variants.length === 0) return [];
  const sizesByRatio = groupSizesByRatio(variants);
  return Array.from(sizesByRatio.entries()).map(([ratio, ratioSizes]) => ({
    value: ratio,
    label: ratio,
    description: describeRatio(ratio),
    resolutions: ratioSizes.map(buildResolutionOption),
  }));
}

export function resolveModelParameterSelection(
  model: PublicModelSummary | null,
  current: ParameterSelection,
): ParameterSelection {
  const variants = model?.variants ?? [];
  if (variants.length === 0) return current;
  const currentVariant = variants.find((variant) => variant.size === current.resolution && variant.quality === current.quality);
  if (currentVariant) {
    return { ...current, aspectRatio: variantToAspectRatio(currentVariant) };
  }
  const firstVariant = sortVariants(variants)[0];
  return {
    aspectRatio: variantToAspectRatio(firstVariant),
    resolution: firstVariant.size,
    quality: firstVariant.quality,
  };
}

export function getModelQualityOptions(
  model: PublicModelSummary | null,
  size: string,
): readonly { value: string; label: string }[] {
  const variants = sortVariants((model?.variants ?? []).filter((variant) => variant.size === size));
  const qualityValues = Array.from(new Set(variants.map((variant) => variant.quality)));
  return qualityValues.map((quality) => ({ value: quality, label: qualityLabel(quality) }));
}

export function findModelVariant(model: PublicModelSummary | null, size: string, quality: string) {
  return (model?.variants ?? []).find((variant) => variant.size === size && variant.quality === quality) ?? null;
}

export function getModelStartingPriceCents(model: PublicModelSummary): number {
  const prices = (model.variants ?? []).map((variant) => variant.member_price_cents);
  if (prices.length === 0) return model.member_price_cents;
  return Math.min(...prices);
}

export function findModelAspectRatioOption(
  model: PublicModelSummary | null,
  ratio: string,
): AspectRatioOption | undefined {
  return buildModelAspectRatioOptions(model).find((option) => option.value === ratio);
}

function groupSizesByRatio(variants: readonly PublicModelVariant[]) {
  const groups = new Map<string, string[]>();
  for (const variant of variants) {
    const ratio = variantToAspectRatio(variant);
    const sizes = groups.get(ratio) ?? [];
    if (!sizes.includes(variant.size)) {
      groups.set(ratio, [...sizes, variant.size]);
    }
  }
  return groups;
}

function buildResolutionOption(size: string): ResolutionOption {
  const known = findKnownResolution(size);
  return known ?? { value: size, label: formatPixels(size), pixels: formatPixels(size) };
}

function findKnownResolution(size: string): ResolutionOption | undefined {
  for (const option of KNOWN_ASPECT_RATIO_OPTIONS) {
    const resolution = option.resolutions.find((item) => item.value === size);
    if (resolution) return resolution;
  }
  return undefined;
}

function describeRatio(ratio: string): string {
  const known = KNOWN_ASPECT_RATIO_OPTIONS.find((option) => option.value === ratio);
  return known?.description ?? ratioDescription(ratio);
}

function ratioDescription(ratio: string): string {
  if (ratio === "1:1") return "方图";
  if (ratio === "2:3") return "竖图";
  if (ratio === "3:2") return "横图";
  return "自定义";
}

function sizeToAspectRatio(size: string): string {
  const [width, height] = parseSize(size);
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function variantToAspectRatio(variant: PublicModelVariant): string {
  return variant.aspect_ratio || sizeToAspectRatio(variant.size);
}

function parseSize(size: string): [number, number] {
  const [width, height] = size.toLowerCase().split("x").map((part) => Number.parseInt(part, 10));
  return [Number.isFinite(width) ? width : 1, Number.isFinite(height) ? height : 1];
}

function compareSizes(left: string, right: string): number {
  const [leftWidth, leftHeight] = parseSize(left);
  const [rightWidth, rightHeight] = parseSize(right);
  return leftWidth * leftHeight - rightWidth * rightHeight;
}

function sortVariants<T extends { size: string; quality: string }>(variants: readonly T[]): T[] {
  return [...variants].sort((left, right) => {
    const sizeOrder = compareSizes(left.size, right.size);
    if (sizeOrder !== 0) return sizeOrder;
    return qualityRank(left.quality) - qualityRank(right.quality);
  });
}

function qualityRank(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality as (typeof QUALITY_ORDER)[number]);
  return index === -1 ? QUALITY_ORDER.length : index;
}

function qualityLabel(quality: string): string {
  if (quality === "low") return "低";
  if (quality === "medium") return "中";
  if (quality === "high") return "高";
  return quality;
}

function formatPixels(size: string): string {
  return size.replace("x", "×");
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}
