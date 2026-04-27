import { buildCharacterPosterPrompt } from "./prompt-apps";

const CHARACTER_POSTER_REQUESTED_COUNT = 1;

export type CharacterPosterSubmitState = Readonly<{
  character: string;
  modelCode: string;
}>;

export type CharacterPosterPromptState = Readonly<{
  character: string;
  note: string;
}>;

export type CharacterPosterImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "generate";
}>;

export type CharacterPosterImage = Readonly<{
  id: string;
  url: string;
  assetId: number;
}>;

export type CharacterPosterState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly CharacterPosterImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitCharacterPoster(form: CharacterPosterSubmitState) {
  return form.character.trim().length > 0 && form.modelCode.trim().length > 0;
}

export function buildCharacterPosterImageRequest(
  form: CharacterPosterPromptState,
  modelCode: string,
): CharacterPosterImageRequest {
  return {
    prompt: buildCharacterPosterPrompt({ character: form.character, note: form.note }),
    model_code: modelCode,
    requested_count: CHARACTER_POSTER_REQUESTED_COUNT,
    mode: "generate",
  };
}

export function getCharacterPosterErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
