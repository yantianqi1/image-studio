import { buildSilhouetteUniversePosterPrompt } from "./prompt-apps";

const SILHOUETTE_UNIVERSE_POSTER_REQUESTED_COUNT = 1;

export type SilhouetteUniversePosterSubmitState = Readonly<{
  modelCode: string;
  topic: string;
}>;

export type SilhouetteUniversePosterPromptState = Readonly<{
  note: string;
  topic: string;
}>;

export type SilhouetteUniversePosterImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "generate";
}>;

export type SilhouetteUniversePosterImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type SilhouetteUniversePosterState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly SilhouetteUniversePosterImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitSilhouetteUniversePoster(form: SilhouetteUniversePosterSubmitState) {
  return form.topic.trim().length > 0 && form.modelCode.trim().length > 0;
}

export function buildSilhouetteUniversePosterImageRequest(
  form: SilhouetteUniversePosterPromptState,
  modelCode: string,
): SilhouetteUniversePosterImageRequest {
  return {
    prompt: buildSilhouetteUniversePosterPrompt({ note: form.note, topic: form.topic }),
    model_code: modelCode,
    requested_count: SILHOUETTE_UNIVERSE_POSTER_REQUESTED_COUNT,
    mode: "generate",
  };
}

export function getSilhouetteUniversePosterErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
