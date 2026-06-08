import type { ImageAssetVisibility, ImageJobItem, ImageJobResult } from "@/lib/public-api";
import type { StoredImage, StoredImageJobItem } from "@/features/studio/studio-types";

const RETRYABLE_ITEM_STATUSES = new Set(["failed", "dead_letter"]);
const CANCELLABLE_ITEM_STATUSES = new Set(["queued", "running", "failed"]);
const SUMMARY_STATUS_ORDER = ["succeeded", "running", "retrying", "queued", "failed", "cancelled"];

export type ImageResultSlot = Readonly<{
  key: string;
  resultIndex: number;
  image?: StoredImage;
  item?: StoredImageJobItem;
}>;

export type ImageJobItemSummary = Readonly<{
  label: string;
  status: string;
}>;

export function imageJobItemsToStoredImageJobItems(
  items: readonly ImageJobItem[],
): StoredImageJobItem[] {
  return items.map((item) => ({
    id: item.id,
    jobId: item.job_id,
    resultIndex: item.result_index,
    status: item.status,
    assetId: item.asset_id ?? null,
    errorCode: item.error_code ?? null,
    errorMessage: item.error_message ?? null,
    manualRetryCount: item.manual_retry_count ?? 0,
  }));
}

export function imageJobResultsToStoredImagesWithItems(
  results: readonly ImageJobResult[],
  items: readonly ImageJobItem[] = [],
): StoredImage[] {
  const itemByResultIndex = mapItemsByResultIndex(imageJobItemsToStoredImageJobItems(items));
  return results.map((result) => {
    const item = itemByResultIndex.get(result.result_index);
    return {
      id: String(result.id),
      assetId: result.asset_id,
      url: result.asset_url,
      thumbnailUrl: result.thumbnail_url ?? result.asset_url,
      visibility: (result.visibility ?? "private") as ImageAssetVisibility,
      resultIndex: result.result_index,
      jobItemId: item?.id,
      jobItemStatus: item?.status,
      jobItemError: item?.errorMessage ?? null,
      jobItemManualRetryCount: item?.manualRetryCount,
      publishedAt: result.published_at ?? null,
      revisedPrompt: result.revised_prompt ?? undefined,
    };
  });
}

export function getImageResultSlots(input: Readonly<{
  count: number;
  images: readonly StoredImage[];
  imageJobItems?: readonly StoredImageJobItem[];
}>): ImageResultSlot[] {
  const items = input.imageJobItems ?? [];
  const itemByResultIndex = mapItemsByResultIndex(items);
  const imageByResultIndex = mapImagesByResultIndex(input.images);
  const maxCount = resolveSlotCount(input.count, input.images, items);
  return Array.from({ length: maxCount }, (_, index) => {
    const resultIndex = index + 1;
    return {
      key: `result-${resultIndex}`,
      resultIndex,
      image: imageByResultIndex.get(resultIndex),
      item: itemByResultIndex.get(resultIndex),
    };
  });
}

export function getImageJobItemSummary(
  items: readonly StoredImageJobItem[],
  totalCount: number,
): ImageJobItemSummary[] {
  if (items.length === 0) {
    return [];
  }
  const total = Math.max(totalCount, items.length);
  const counts = countDisplayStatuses(items);
  return SUMMARY_STATUS_ORDER.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count > 0 ? [{ label: `${count}/${total} ${status}`, status }] : [];
  });
}

export function getImageJobItemDisplayStatus(item: StoredImageJobItem): string {
  if (item.status === "queued" && item.manualRetryCount > 0) {
    return "retrying";
  }
  if (item.status === "dead_letter") {
    return "failed";
  }
  return item.status;
}

export function isRetryableImageJobItem(item: StoredImageJobItem | undefined): boolean {
  return item ? RETRYABLE_ITEM_STATUSES.has(item.status) : false;
}

export function isCancellableImageJobItem(item: StoredImageJobItem | undefined): boolean {
  return item ? CANCELLABLE_ITEM_STATUSES.has(item.status) : false;
}

export function mergeImageJobItemUpdate(
  currentItems: readonly StoredImageJobItem[],
  updatedItem: ImageJobItem,
): StoredImageJobItem[] {
  const nextItem = imageJobItemsToStoredImageJobItems([updatedItem])[0];
  const existingIndex = currentItems.findIndex((item) => item.id === nextItem.id);
  if (existingIndex < 0) {
    return sortItemsByResultIndex([...currentItems, nextItem]);
  }
  return sortItemsByResultIndex(currentItems.map((item) => (item.id === nextItem.id ? nextItem : item)));
}

function mapItemsByResultIndex(items: readonly StoredImageJobItem[]) {
  return new Map(items.map((item) => [item.resultIndex, item]));
}

function mapImagesByResultIndex(images: readonly StoredImage[]) {
  return new Map(images.map((image, index) => [image.resultIndex ?? index + 1, image]));
}

function resolveSlotCount(
  count: number,
  images: readonly StoredImage[],
  items: readonly StoredImageJobItem[],
) {
  const maxImageIndex = Math.max(0, ...images.map((image, index) => image.resultIndex ?? index + 1));
  const maxItemIndex = Math.max(0, ...items.map((item) => item.resultIndex));
  return Math.max(count, images.length, maxImageIndex, maxItemIndex);
}

function countDisplayStatuses(items: readonly StoredImageJobItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const status = getImageJobItemDisplayStatus(item);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return counts;
}

function sortItemsByResultIndex(items: readonly StoredImageJobItem[]) {
  return [...items].sort((a, b) => a.resultIndex - b.resultIndex);
}
