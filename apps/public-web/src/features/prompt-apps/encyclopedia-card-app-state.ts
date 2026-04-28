import { buildEncyclopediaCardPrompt } from "./prompt-apps";

const ENCYCLOPEDIA_CARD_REQUESTED_COUNT = 1;

export type EncyclopediaCardSubmitState = Readonly<{
  modelCode: string;
  topic: string;
}>;

export type EncyclopediaCardPromptState = Readonly<{
  note: string;
  topic: string;
}>;

export type EncyclopediaCardImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "generate";
}>;

export type EncyclopediaCardImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type EncyclopediaCardState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly EncyclopediaCardImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitEncyclopediaCard(form: EncyclopediaCardSubmitState) {
  return form.topic.trim().length > 0 && form.modelCode.trim().length > 0;
}

export function buildEncyclopediaCardImageRequest(
  form: EncyclopediaCardPromptState,
  modelCode: string,
): EncyclopediaCardImageRequest {
  return {
    prompt: buildEncyclopediaCardPrompt({ note: form.note, topic: form.topic }),
    model_code: modelCode,
    requested_count: ENCYCLOPEDIA_CARD_REQUESTED_COUNT,
    mode: "generate",
  };
}

export function getEncyclopediaCardErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
