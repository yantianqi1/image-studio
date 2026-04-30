import type { ChangeEvent, FormEvent } from "react";

import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";
import type { PublicModelSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

import {
  canSubmitXiaohongshuAvatarPoster,
  type XiaohongshuAvatarPosterForm,
  type XiaohongshuAvatarPosterState,
} from "./xiaohongshu-avatar-poster-app-state";
import { XiaohongshuAvatarPosterUpload } from "./xiaohongshu-avatar-poster-upload";
import styles from "./prompt-apps.module.css";

const NOTE_ROWS = 5;

type SubmitDisabledInput = Readonly<{
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  sourceAssetId: number | null;
  state: XiaohongshuAvatarPosterState;
  uploadState: SourceUploadState;
}>;

export function XiaohongshuAvatarPosterFormPanel(props: Readonly<{
  form: XiaohongshuAvatarPosterForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onClearSourceImage: () => void;
  onFormChange: (form: XiaohongshuAvatarPosterForm) => void;
  onSourceUpload: (file: File) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  sourceImage: GenerationSourceImage | null;
  state: XiaohongshuAvatarPosterState;
  uploadState: SourceUploadState;
}>) {
  const disabled = isXiaohongshuAvatarPosterSubmitDisabled({
    modelsState: props.modelsState,
    resolvedModelCode: props.resolvedModelCode,
    selectedModel: props.selectedModel,
    sourceAssetId: props.sourceImage?.assetId ?? null,
    state: props.state,
    uploadState: props.uploadState,
  });

  return (
    <form className={styles.posterPanel} onSubmit={props.onSubmit}>
      <PanelHeader />
      <XiaohongshuAvatarPosterUpload
        sourceImage={props.sourceImage}
        uploadState={props.uploadState}
        onClear={props.onClearSourceImage}
        onUpload={props.onSourceUpload}
      />
      <CharacterNoteInput form={props.form} onFormChange={props.onFormChange} />
      <ModelSelect
        form={props.form}
        models={props.models}
        modelsState={props.modelsState}
        onFormChange={props.onFormChange}
        resolvedModelCode={props.resolvedModelCode}
      />
      <button className={styles.posterSubmit} disabled={disabled} type="submit">
        {props.state.status === "submitting" ? "生成中" : "生成海报"}
      </button>
    </form>
  );
}

export function isXiaohongshuAvatarPosterSubmitDisabled(input: SubmitDisabledInput) {
  if (input.state.status === "submitting" || input.uploadState.status === "uploading") {
    return true;
  }
  if (input.modelsState.status !== "ready" || !input.selectedModel) {
    return true;
  }
  return !canSubmitXiaohongshuAvatarPoster({
    modelCode: input.resolvedModelCode,
    sourceAssetId: input.sourceAssetId,
  });
}

function PanelHeader() {
  return (
    <div className={styles.posterPanelHeader}>
      <span className={styles.appStatus}>内置提示词</span>
      <h1 className={styles.posterHeading}>小红书头像出逃海报</h1>
      <p className={styles.posterLead}>上传小红书主页截图，生成头像拟人化潮流视觉海报。</p>
    </div>
  );
}

function CharacterNoteInput(props: Readonly<{
  form: XiaohongshuAvatarPosterForm;
  onFormChange: (form: XiaohongshuAvatarPosterForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>全身卡通人物备注</span>
      <textarea
        className={styles.textarea}
        name="characterNote"
        placeholder="可补充人物性别、发型、服装、姿态或气质；留空则延续头像风格。"
        rows={NOTE_ROWS}
        value={props.form.characterNote}
        onChange={(event) => props.onFormChange({ ...props.form, characterNote: event.target.value })}
      />
    </label>
  );
}

function ModelSelect(props: Readonly<{
  form: XiaohongshuAvatarPosterForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: XiaohongshuAvatarPosterForm) => void;
  resolvedModelCode: string;
}>) {
  const statusText = getModelsStatusText(props.modelsState, props.models.length);

  return (
    <label className={styles.fieldGroup}>
      <span>模型</span>
      <select
        className={styles.modelSelect}
        disabled={props.modelsState.status !== "ready" || props.models.length === 0}
        name="modelCode"
        value={props.resolvedModelCode}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          props.onFormChange({ ...props.form, modelCode: event.target.value })
        }
      >
        <ModelOptions models={props.models} modelsState={props.modelsState} />
      </select>
      <small className={styles.fieldHint}>{statusText}</small>
    </label>
  );
}

function ModelOptions(props: Readonly<{
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
}>) {
  if (props.models.length === 0) {
    return <option value="">{getModelEmptyOptionLabel(props.modelsState)}</option>;
  }
  return props.models.map((model) => (
    <option key={model.code} value={model.code}>
      {model.display_name}
    </option>
  ));
}

function getModelsStatusText(
  modelsState: ResourceState<readonly PublicModelSummary[]>,
  modelCount: number,
) {
  if (modelsState.status === "loading") {
    return "正在加载图片模型";
  }
  if (modelsState.status === "error") {
    return modelsState.message;
  }
  return modelCount > 0 ? "仅显示可用于图片生成的模型" : "当前没有可用图片模型";
}

function getModelEmptyOptionLabel(modelsState: ResourceState<readonly PublicModelSummary[]>) {
  if (modelsState.status === "loading") {
    return "模型加载中";
  }
  if (modelsState.status === "error") {
    return "模型读取失败";
  }
  return "暂无可用图片模型";
}
