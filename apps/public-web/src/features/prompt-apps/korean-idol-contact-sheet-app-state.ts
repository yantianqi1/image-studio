import { buildKoreanIdolContactSheetPrompt } from "./prompt-apps";

const KOREAN_IDOL_CONTACT_SHEET_REQUESTED_COUNT = 1;

export type KoreanIdolContactSheetSubmitState = Readonly<{
  modelCode: string;
  sourceAssetId: number | null;
}>;

export type KoreanIdolContactSheetPromptState = Readonly<{
  note: string;
}>;

export type KoreanIdolContactSheetForm = KoreanIdolContactSheetPromptState & Readonly<{
  modelCode: string;
}>;

export type KoreanIdolContactSheetImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "edit";
  source_asset_id: number;
}>;

export type KoreanIdolContactSheetImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type KoreanIdolContactSheetState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly KoreanIdolContactSheetImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitKoreanIdolContactSheet(form: KoreanIdolContactSheetSubmitState) {
  return form.sourceAssetId !== null && form.modelCode.trim().length > 0;
}

export function buildKoreanIdolContactSheetImageRequest(
  form: KoreanIdolContactSheetPromptState,
  modelCode: string,
  sourceAssetId: number,
): KoreanIdolContactSheetImageRequest {
  return {
    prompt: buildKoreanIdolContactSheetPrompt({ note: form.note }),
    model_code: modelCode,
    requested_count: KOREAN_IDOL_CONTACT_SHEET_REQUESTED_COUNT,
    mode: "edit",
    source_asset_id: sourceAssetId,
  };
}

export function getKoreanIdolContactSheetErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
