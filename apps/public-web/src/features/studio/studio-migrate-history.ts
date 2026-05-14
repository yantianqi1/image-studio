import { createClientId } from "@/lib/client-id";
import type { StudioConversation, StudioTurn, TurnStatus } from "@/features/studio/studio-types";

const MIGRATION_DONE_KEY = "commercial_studio_history_migrated";
const OLD_STORAGE_KEY = "commercial_studio_generation_history";

type OldHistoryImage = {
  id: string;
  url: string;
  thumbnailUrl?: string;
  assetId?: number;
  visibility?: string;
  width?: number;
  height?: number;
};

type OldReferenceImage = {
  assetId: number;
  assetUrl: string;
  thumbnailUrl?: string;
};

type OldHistoryItem = {
  id: string;
  title: string;
  prompt: string;
  modelCode: string;
  count: number;
  aspectRatio: string;
  resolution?: string;
  quality?: string;
  visibility?: string;
  status: string;
  images: readonly OldHistoryImage[];
  referenceImages?: readonly OldReferenceImage[];
  errorMessage?: string | null;
  taskId?: number | null;
  taskStatus?: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapStatus(status: string): TurnStatus {
  if (status === "success") return "success";
  if (status === "failed") return "error";
  if (status === "generating") return "generating";
  if (status === "pending") return "queued";
  return "success";
}

function convertItemToTurn(item: OldHistoryItem): StudioTurn {
  return {
    id: createClientId("studio-turn"),
    prompt: item.prompt,
    model: item.modelCode,
    mode: "generate",
    referenceImages: (item.referenceImages ?? []).map((img) => ({
      name: "reference",
      assetId: img.assetId,
      assetUrl: img.assetUrl,
      thumbnailUrl: img.thumbnailUrl,
    })),
    count: item.count,
    aspectRatio: item.aspectRatio,
    resolution: item.resolution ?? "1024x1024",
    quality: item.quality ?? "medium",
    visibility: (item.visibility as "private" | "public") ?? "private",
    images: item.images.map((img) => ({
      id: img.id,
      assetId: img.assetId,
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      visibility: (img.visibility as "private" | "public") ?? "private",
      width: img.width,
      height: img.height,
    })),
    status: mapStatus(item.status),
    error: item.errorMessage ?? undefined,
    taskId: item.taskId,
    taskStatus: item.taskStatus,
    createdAt: item.createdAt,
  };
}

export function migrateHistoryIfNeeded(): readonly StudioConversation[] {
  if (typeof window === "undefined") return [];
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return [];

  const raw = localStorage.getItem(OLD_STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    return [];
  }

  let items: OldHistoryItem[];
  try {
    items = JSON.parse(raw);
  } catch {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    return [];
  }

  const conversations: StudioConversation[] = items.map((item) => ({
    id: item.id,
    title: item.title || item.prompt.slice(0, 12) || "未命名",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    turns: [convertItemToTurn(item)],
  }));

  localStorage.setItem(MIGRATION_DONE_KEY, "1");
  return conversations;
}
