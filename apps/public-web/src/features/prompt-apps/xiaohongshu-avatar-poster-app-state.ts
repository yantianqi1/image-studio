import { buildXiaohongshuAvatarPosterPrompt } from "./prompt-apps";

const XIAOHONGSHU_AVATAR_POSTER_REQUESTED_COUNT = 1;

export type XiaohongshuAvatarPosterSubmitState = Readonly<{
  modelCode: string;
  sourceAssetId: number | null;
}>;

export type XiaohongshuAvatarPosterPromptState = Readonly<{
  characterNote: string;
}>;

export type XiaohongshuAvatarPosterForm = XiaohongshuAvatarPosterPromptState & Readonly<{
  modelCode: string;
}>;

export type XiaohongshuAvatarPosterImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "edit";
  source_asset_id: number;
}>;

export type XiaohongshuAvatarPosterImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type XiaohongshuAvatarPosterState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly XiaohongshuAvatarPosterImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitXiaohongshuAvatarPoster(form: XiaohongshuAvatarPosterSubmitState) {
  return form.sourceAssetId !== null && form.modelCode.trim().length > 0;
}

export function buildXiaohongshuAvatarPosterImageRequest(
  form: XiaohongshuAvatarPosterPromptState,
  modelCode: string,
  sourceAssetId: number,
): XiaohongshuAvatarPosterImageRequest {
  return {
    prompt: buildXiaohongshuAvatarPosterPrompt({ characterNote: form.characterNote }),
    model_code: modelCode,
    requested_count: XIAOHONGSHU_AVATAR_POSTER_REQUESTED_COUNT,
    mode: "edit",
    source_asset_id: sourceAssetId,
  };
}

export function getXiaohongshuAvatarPosterErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
