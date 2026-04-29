"use client";

import {
  PromptImageGenerateApp,
  type PromptImageGenerateForm,
} from "./prompt-image-generate-app";
import {
  buildSongPoemSceneImageRequest,
  canSubmitSongPoemScene,
  getSongPoemSceneErrorMessage,
} from "./song-poem-scene-app-state";

export function SongPoemSceneApp() {
  return (
    <PromptImageGenerateApp
      buildImageRequest={buildSongPoemSceneRequest}
      canSubmit={canSubmitSongPoemSceneForm}
      getErrorMessage={getSongPoemSceneErrorMessage}
      headerTitle="宋词双境图"
      lead="输入对应小诗，生成墙内墙外对照的宋代诗意场景。"
      notePlaceholder="可补充季节、光线、情绪浓度或画面题签。"
      primaryLabel="对应小诗"
      primaryName="poem"
      primaryPlaceholder="例如：花褪残红青杏小"
      submitLabel="生成画面"
    />
  );
}

function buildSongPoemSceneRequest(form: PromptImageGenerateForm, modelCode: string) {
  return buildSongPoemSceneImageRequest({ note: form.note, poem: form.primary }, modelCode);
}

function canSubmitSongPoemSceneForm(form: Readonly<{ modelCode: string; primary: string }>) {
  return canSubmitSongPoemScene({ modelCode: form.modelCode, poem: form.primary });
}
