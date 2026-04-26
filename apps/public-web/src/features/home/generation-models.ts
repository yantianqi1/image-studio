import type { PublicModelSummary } from "@/lib/public-api";

const PLACEHOLDER_MODEL_CODES = new Set(["local-dev-image"]);

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
  return model.capability === "image" && !PLACEHOLDER_MODEL_CODES.has(model.code);
}
