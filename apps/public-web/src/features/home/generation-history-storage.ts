import {
  GENERATION_HISTORY_STORAGE_KEY,
  MAX_GENERATION_HISTORY_ITEMS,
  type GenerationHistoryDraft,
  type GenerationHistoryItem,
  type GenerationHistoryUpdate,
} from "@/features/home/generation-history.types";
import type { GenerationSourceImage } from "@/features/home/generation-workbench.types";

function now() {
  return new Date().toISOString();
}

function createHistoryTitle(prompt: string) {
  const collapsed = prompt.trim().replace(/\s+/g, " ");

  if (!collapsed) {
    return "未命名生成";
  }

  const preview = collapsed.slice(0, 18);
  return collapsed.length > 18 ? `${preview}…` : preview;
}

function generateHistoryId() {
  return crypto.randomUUID();
}

function sortHistories(items: readonly GenerationHistoryItem[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function clampHistories(items: readonly GenerationHistoryItem[]) {
  return sortHistories(items).slice(0, MAX_GENERATION_HISTORY_ITEMS);
}

function hasHistoryMeaningfulChange(
  current: GenerationHistoryItem,
  next: GenerationHistoryItem,
) {
  return current.title !== next.title ||
    current.prompt !== next.prompt ||
    current.modelCode !== next.modelCode ||
    current.modelName !== next.modelName ||
    current.count !== next.count ||
    current.aspectRatio !== next.aspectRatio ||
    current.status !== next.status ||
    current.images !== next.images ||
    current.sourceImage !== next.sourceImage ||
    current.referenceImages !== next.referenceImages ||
    current.errorMessage !== next.errorMessage ||
    current.taskId !== next.taskId ||
    current.taskStatus !== next.taskStatus;
}

function applyHistoryPatch(
  item: GenerationHistoryItem,
  patch: GenerationHistoryUpdate,
  updatedAt: string,
) {
  const next = {
    ...item,
    title: patch.title?.trim() || item.title,
    prompt: patch.prompt ?? item.prompt,
    modelCode: patch.modelCode ?? item.modelCode,
    modelName: patch.modelName ?? item.modelName,
    count: patch.count ?? item.count,
    aspectRatio: patch.aspectRatio ?? item.aspectRatio,
    status: patch.status ?? item.status,
    images: patch.images ?? item.images,
    sourceImage: patch.sourceImage === undefined ? item.sourceImage : patch.sourceImage,
    referenceImages: patch.referenceImages === undefined ? item.referenceImages : patch.referenceImages,
    errorMessage: patch.errorMessage === undefined ? item.errorMessage : patch.errorMessage ?? undefined,
    taskId: patch.taskId === undefined ? item.taskId : patch.taskId ?? undefined,
    taskStatus: patch.taskStatus === undefined ? item.taskStatus : patch.taskStatus ?? undefined,
    createdAt: item.createdAt,
    updatedAt,
  };

  return hasHistoryMeaningfulChange(item, next) ? next : item;
}

function resolveReferenceImages(
  sourceImage: GenerationSourceImage | null | undefined,
  referenceImages: readonly GenerationSourceImage[] | undefined,
) {
  if (referenceImages !== undefined) {
    return referenceImages;
  }
  return sourceImage ? [sourceImage] : [];
}

function isHistoryItem(value: unknown): value is GenerationHistoryItem {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    "title" in value &&
    "prompt" in value &&
    "modelCode" in value &&
    "modelName" in value &&
    "count" in value &&
    "aspectRatio" in value &&
    "status" in value &&
    "createdAt" in value &&
    "updatedAt" in value
  );
}

function normalizeHistories(payload: unknown) {
  if (!Array.isArray(payload)) {
    return [] as const;
  }

  return payload.filter(isHistoryItem).slice(0, MAX_GENERATION_HISTORY_ITEMS);
}

export function listGenerationHistories(): readonly GenerationHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(GENERATION_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeHistories(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveGenerationHistories(items: readonly GenerationHistoryItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      GENERATION_HISTORY_STORAGE_KEY,
      JSON.stringify(clampHistories(items)),
    );
  } catch {
    // Explicitly surface storage failures via console for debugging.
    console.error("Failed to persist generation history to localStorage");
  }
}

export function createGenerationHistory(
  items: readonly GenerationHistoryItem[],
  draft: GenerationHistoryDraft,
) {
  const createdAt = now();
  const referenceImages = resolveReferenceImages(draft.sourceImage, draft.referenceImages);
  const history: GenerationHistoryItem = {
    id: draft.id ?? generateHistoryId(),
    title: draft.title?.trim() || createHistoryTitle(draft.prompt),
    prompt: draft.prompt,
    modelCode: draft.modelCode,
    modelName: draft.modelName,
    count: draft.count,
    aspectRatio: draft.aspectRatio,
    status: draft.status ?? "pending",
    images: draft.images ?? [],
    sourceImage: draft.sourceImage ?? referenceImages[0] ?? null,
    referenceImages,
    errorMessage: draft.errorMessage,
    taskId: draft.taskId,
    taskStatus: draft.taskStatus,
    createdAt,
    updatedAt: createdAt,
  };

  return clampHistories([history, ...items]);
}

export function updateGenerationHistory(
  items: readonly GenerationHistoryItem[],
  historyId: string,
  patch: GenerationHistoryUpdate,
) {
  const updatedAt = now();
  const patchedItems = items.map((item) => (
    item.id === historyId ? applyHistoryPatch(item, patch, updatedAt) : item
  ));
  return patchedItems.some((item, index) => item !== items[index])
    ? clampHistories(patchedItems)
    : items;
}

export function renameGenerationHistory(
  items: readonly GenerationHistoryItem[],
  historyId: string,
  title: string,
) {
  return updateGenerationHistory(items, historyId, { title });
}

export function deleteGenerationHistory(
  items: readonly GenerationHistoryItem[],
  historyId: string,
) {
  return items.filter((item) => item.id !== historyId);
}
