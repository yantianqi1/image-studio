import type { PublicModelSummary } from "@/lib/public-api";

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
