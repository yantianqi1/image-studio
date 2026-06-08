import type { ImageAssetVisibility, ImageGalleryItem, ImageGalleryScope, ImageJobResult } from "@/lib/public-api";

export const IMAGE_GALLERY_ITEMS_ADDED_EVENT = "commercial-studio:image-gallery-items-added";

type GalleryItemsAddedPayload = Readonly<{
  items: readonly ImageGalleryItem[];
}>;

type GalleryItemContext = Readonly<{
  prompt: string;
  visibility: ImageAssetVisibility;
}>;

export function dispatchImageGalleryItemsAdded(items: readonly ImageGalleryItem[]) {
  if (items.length === 0 || typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<GalleryItemsAddedPayload>(
    IMAGE_GALLERY_ITEMS_ADDED_EVENT,
    { detail: { items } },
  ));
}

export function subscribeImageGalleryItemsAdded(
  listener: (items: readonly ImageGalleryItem[]) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handler = (event: Event) => {
    listener(readGalleryItemsAddedEvent(event).items);
  };
  window.addEventListener(IMAGE_GALLERY_ITEMS_ADDED_EVENT, handler);
  return () => window.removeEventListener(IMAGE_GALLERY_ITEMS_ADDED_EVENT, handler);
}

export function mergeImageGalleryItems(
  current: readonly ImageGalleryItem[],
  incoming: readonly ImageGalleryItem[],
  scope: ImageGalleryScope,
) {
  const scopedIncoming = incoming.filter((item) => isGalleryItemInScope(item, scope));
  const incomingIds = new Set(scopedIncoming.map((item) => item.asset_id));
  const scopedCurrent = current.filter((item) => {
    return isGalleryItemInScope(item, scope) && !incomingIds.has(item.asset_id);
  });
  return [...scopedIncoming, ...scopedCurrent];
}

export function imageJobResultsToGalleryItems(
  results: readonly ImageJobResult[],
  context: GalleryItemContext,
) {
  return results.map((result) => ({
    asset_id: result.asset_id,
    asset_url: result.asset_url,
    thumbnail_url: result.thumbnail_url ?? result.asset_url,
    visibility: result.visibility ?? context.visibility,
    published_at: result.published_at ?? null,
    created_at: result.created_at ?? new Date().toISOString(),
    job_id: result.job_id,
    result_index: result.result_index,
    prompt: context.prompt,
    revised_prompt: result.revised_prompt,
  }));
}

function readGalleryItemsAddedEvent(event: Event): GalleryItemsAddedPayload {
  if (!(event instanceof CustomEvent) || !Array.isArray(event.detail?.items)) {
    throw new Error("Invalid image gallery items event");
  }
  return event.detail as GalleryItemsAddedPayload;
}

function isGalleryItemInScope(item: ImageGalleryItem, scope: ImageGalleryScope) {
  return scope === "mine" || item.visibility === "public";
}
