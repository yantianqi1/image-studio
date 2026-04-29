import type { GenerationSourceImage } from "@/features/home/generation-workbench.types";

export const GENERATION_HISTORY_STORAGE_KEY = "commercial_studio_generation_history";
export const MAX_GENERATION_HISTORY_ITEMS = 50;

export type GenerationHistoryStatus =
  | "idle"
  | "pending"
  | "generating"
  | "success"
  | "failed";

export type GenerationHistoryImage = Readonly<{
  id: string;
  url: string;
  assetId?: number;
  width?: number;
  height?: number;
}>;

export type GenerationHistoryItem = Readonly<{
  id: string;
  title: string;
  prompt: string;
  modelCode: string;
  modelName: string;
  count: number;
  aspectRatio: string;
  status: GenerationHistoryStatus;
  images: readonly GenerationHistoryImage[];
  sourceImage?: GenerationSourceImage | null;
  referenceImages?: readonly GenerationSourceImage[];
  errorMessage?: string | null;
  taskId?: number | null;
  taskStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type GenerationHistoryDraft = Readonly<{
  id?: string;
  title?: string;
  prompt: string;
  modelCode: string;
  modelName: string;
  count: number;
  aspectRatio: string;
  status?: GenerationHistoryStatus;
  images?: readonly GenerationHistoryImage[];
  sourceImage?: GenerationSourceImage | null;
  referenceImages?: readonly GenerationSourceImage[];
  errorMessage?: string | null;
  taskId?: number | null;
  taskStatus?: string | null;
}>;

export type GenerationHistoryUpdate = Readonly<{
  title?: string;
  prompt?: string;
  modelCode?: string;
  modelName?: string;
  count?: number;
  aspectRatio?: string;
  status?: GenerationHistoryStatus;
  images?: readonly GenerationHistoryImage[];
  sourceImage?: GenerationSourceImage | null;
  referenceImages?: readonly GenerationSourceImage[];
  errorMessage?: string | null;
  taskId?: number | null;
  taskStatus?: string | null;
}>;
