import {
  dispatchImageGalleryItemsAdded,
  imageJobResultsToGalleryItems,
} from "@/features/gallery/gallery-events";
import type { CompletedImageJob } from "@/features/studio/studio-job-polling";
import type { ImageAssetVisibility } from "@/lib/public-api";

type StudioGalleryResultContext = Readonly<{
  prompt: string;
  visibility: ImageAssetVisibility;
}>;

export function publishStudioImageJobResultsToGallery(
  context: StudioGalleryResultContext,
  results: CompletedImageJob["results"],
) {
  dispatchImageGalleryItemsAdded(imageJobResultsToGalleryItems(results, context));
}
