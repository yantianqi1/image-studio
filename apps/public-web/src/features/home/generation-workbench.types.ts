export const MIN_REQUESTED_COUNT = 1;
export const MAX_REQUESTED_COUNT = 4;
export const DEFAULT_ASPECT_RATIO = "1:1";
export const DEFAULT_QUALITY = "medium";

export type ImageQuality = "low" | "medium" | "high";

export type ImageFormState = Readonly<{
  model_code: string;
  prompt: string;
  requested_count: number;
  aspect_ratio: string;
  quality: ImageQuality;
}>;

export type GenerationSourceImage = Readonly<{
  assetId: number;
  assetUrl: string;
  thumbnailUrl?: string;
  mimeType?: string;
}>;

export type SourceUploadState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "uploading" }>
  | Readonly<{ status: "error"; message: string }>;

export type GenerationState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; jobId: number; taskStatus: string }>;
