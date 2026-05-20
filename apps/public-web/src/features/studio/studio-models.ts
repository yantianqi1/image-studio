import type { PublicModelSummary } from "@/lib/public-api";
import {
  ASPECT_RATIO_OPTIONS as KNOWN_ASPECT_RATIO_OPTIONS,
  type AspectRatioOption,
} from "@/features/studio/studio-aspect-ratio";

export function filterImageModels(models: readonly PublicModelSummary[]) {
  return models.filter((model) => model.capability === "image");
}

export function resolveImageModel(models: readonly PublicModelSummary[], modelCode: string) {
  const imageModels = filterImageModels(models);
  const resolvedModelCode = imageModels.find((model) => model.code === modelCode)?.code ?? imageModels[0]?.code ?? "";
  const selectedModel = imageModels.find((model) => model.code === resolvedModelCode) ?? null;
  return { imageModels, resolvedModelCode, selectedModel };
}

export function buildModelAspectRatioOptions(_model: PublicModelSummary | null): readonly AspectRatioOption[] {
  return [];
}

export function resolveModelParameterSelection(
  _model: PublicModelSummary | null,
  current: Readonly<{ aspectRatio: string; resolution: string; quality: string }>,
) {
  return current;
}

export function getModelQualityOptions(
  _model: PublicModelSummary | null,
  _size: string,
): readonly { value: string; label: string }[] {
  return [];
}

export function findModelAspectRatioOption(
  _model: PublicModelSummary | null,
  ratio: string,
): AspectRatioOption | undefined {
  return KNOWN_ASPECT_RATIO_OPTIONS.find((option) => option.value === ratio);
}
