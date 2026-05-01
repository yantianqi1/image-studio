import type { GenerationHistoryImage } from "@/features/home/generation-history.types";
import type { GenerationSourceImage } from "@/features/home/generation-workbench.types";

const IMAGE_ASSET_PUBLIC_PATH = "/api/public/image/assets";

export function getImageAssetThumbnailUrl(assetId: number) {
  return `${IMAGE_ASSET_PUBLIC_PATH}/${assetId}/thumbnail`;
}

export function getGenerationSourceImagePreviewUrl(image: GenerationSourceImage) {
  return image.thumbnailUrl ?? getImageAssetThumbnailUrl(image.assetId);
}

export function historyImageToSourceImage(image: GenerationHistoryImage) {
  if (image.assetId === undefined) {
    return null;
  }

  return {
    assetId: image.assetId,
    assetUrl: image.url,
    thumbnailUrl: image.thumbnailUrl ?? getImageAssetThumbnailUrl(image.assetId),
  } satisfies GenerationSourceImage;
}
