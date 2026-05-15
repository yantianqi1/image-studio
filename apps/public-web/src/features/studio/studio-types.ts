import type { ImageAssetVisibility } from "@/lib/public-api.types";

export type StudioMode = "generate" | "edit" | "chat";
export type TurnStatus = "queued" | "generating" | "success" | "error" | "cancelled";
export type ComposerMode = "generate" | "chat";

export type StoredReferenceImage = Readonly<{
  name: string;
  assetId?: number;
  assetUrl?: string;
  thumbnailUrl?: string;
  dataUrl?: string;
  mimeType?: string;
}>;

export type StoredImage = Readonly<{
  id: string;
  assetId?: number;
  url?: string;
  thumbnailUrl?: string;
  visibility?: ImageAssetVisibility;
  width?: number;
  height?: number;
  revisedPrompt?: string;
  error?: string;
}>;

export type StudioTurn = Readonly<{
  id: string;
  prompt: string;
  model: string;
  mode: StudioMode;
  referenceImages: readonly StoredReferenceImage[];
  count: number;
  aspectRatio: string;
  resolution: string;
  quality: string;
  visibility: ImageAssetVisibility;
  images: readonly StoredImage[];
  status: TurnStatus;
  error?: string;
  taskId?: number | null;
  taskStatus?: string | null;
  createdAt: string;
}>;

export type StudioConversation = Readonly<{
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: readonly StudioTurn[];
}>;

export type StudioConversationStats = Readonly<{
  running: number;
  queued: number;
}>;

export type TurnDraft = Readonly<{
  prompt: string;
  model: string;
  mode: StudioMode;
  referenceImages: readonly StoredReferenceImage[];
  count: number;
  aspectRatio: string;
  resolution: string;
  quality: string;
  visibility: ImageAssetVisibility;
}>;

export type TurnUpdate = Partial<Pick<StudioTurn, "status" | "images" | "referenceImages" | "error" | "taskId" | "taskStatus">>;

export const DEFAULT_ASPECT_RATIO = "1:1";
export const DEFAULT_RESOLUTION = "1024x1024";
export const DEFAULT_QUALITY = "medium";
export const DEFAULT_COUNT = 1;
export const MIN_COUNT = 1;
export const MAX_COUNT = 4;
