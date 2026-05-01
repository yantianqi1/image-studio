import type { GenerationSourceImage } from "@/features/home/generation-workbench.types";
import { getImageAssetThumbnailUrl } from "@/features/home/generation-source-images";
import { publicApi } from "@/lib/public-api";

export async function uploadReferenceImages(files: readonly File[]) {
  const uploadedImages: GenerationSourceImage[] = [];
  for (const file of files) {
    const uploaded = await publicApi.uploadImageAsset(file);
    uploadedImages.push({
      assetId: uploaded.id,
      assetUrl: uploaded.asset_url,
      thumbnailUrl: uploaded.thumbnail_url ?? getImageAssetThumbnailUrl(uploaded.id),
      mimeType: uploaded.mime_type,
    });
  }
  return uploadedImages;
}
