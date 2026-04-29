import { buildSongPoemScenePrompt } from "./prompt-apps";

const SONG_POEM_SCENE_REQUESTED_COUNT = 1;

export type SongPoemSceneSubmitState = Readonly<{
  modelCode: string;
  poem: string;
}>;

export type SongPoemScenePromptState = Readonly<{
  note: string;
  poem: string;
}>;

export type SongPoemSceneForm = SongPoemScenePromptState &
  Readonly<{
    modelCode: string;
  }>;

export type SongPoemSceneImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "generate";
}>;

export type SongPoemSceneImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type SongPoemSceneState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly SongPoemSceneImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitSongPoemScene(form: SongPoemSceneSubmitState) {
  return form.poem.trim().length > 0 && form.modelCode.trim().length > 0;
}

export function buildSongPoemSceneImageRequest(
  form: SongPoemScenePromptState,
  modelCode: string,
): SongPoemSceneImageRequest {
  return {
    prompt: buildSongPoemScenePrompt({ note: form.note, poem: form.poem }),
    model_code: modelCode,
    requested_count: SONG_POEM_SCENE_REQUESTED_COUNT,
    mode: "generate",
  };
}

export function getSongPoemSceneErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
