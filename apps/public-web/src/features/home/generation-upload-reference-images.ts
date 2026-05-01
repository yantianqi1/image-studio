import type { GenerationSourceImage } from "@/features/home/generation-workbench.types";
import { publicApi } from "@/lib/public-api";

export async function uploadReferenceImages(files: readonly File[]) {
  const uploadedImages: GenerationSourceImage[] = [];
  for (const file of files) {
    const uploaded = await publicApi.uploadImageAsset(file);
    uploadedImages.push({
      assetId: uploaded.id,
      assetUrl: uploaded.asset_url,
      mimeType: uploaded.mime_type,
    });
  }
  return uploadedImages;
}
