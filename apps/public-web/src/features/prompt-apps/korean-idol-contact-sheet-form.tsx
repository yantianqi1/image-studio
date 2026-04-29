import type { ChangeEvent, FormEvent } from "react";

import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";
import type { PublicModelSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

import {
  canSubmitKoreanIdolContactSheet,
  type KoreanIdolContactSheetForm,
  type KoreanIdolContactSheetState,
} from "./korean-idol-contact-sheet-app-state";
import { ReferenceImageField } from "./korean-idol-contact-sheet-upload";
import styles from "./prompt-apps.module.css";

const NOTE_ROWS = 4;

type SubmitDisabledInput = Readonly<{
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  sourceAssetId: number | null;
  state: KoreanIdolContactSheetState;
  uploadState: SourceUploadState;
}>;

export function KoreanIdolContactSheetFormPanel(props: Readonly<{
  form: KoreanIdolContactSheetForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onClearSourceImage: () => void;
  onFormChange: (form: KoreanIdolContactSheetForm) => void;
  onSourceUpload: (file: File) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  sourceImage: GenerationSourceImage | null;
  state: KoreanIdolContactSheetState;
  uploadState: SourceUploadState;
}>) {
  const disabled = isKoreanIdolContactSheetSubmitDisabled({
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
      <ReferenceImageField
        sourceImage={props.sourceImage}
        uploadState={props.uploadState}
        onClear={props.onClearSourceImage}
        onUpload={props.onSourceUpload}
      />
      <NoteInput form={props.form} onFormChange={props.onFormChange} />
      <ModelSelect
        form={props.form}
        models={props.models}
        modelsState={props.modelsState}
        onFormChange={props.onFormChange}
        resolvedModelCode={props.resolvedModelCode}
      />
      <button className={styles.posterSubmit} disabled={disabled} type="submit">
        {props.state.status === "submitting" ? "生成中" : "生成九宫格"}
      </button>
    </form>
  );
}

export function isKoreanIdolContactSheetSubmitDisabled(input: SubmitDisabledInput) {
  if (input.state.status === "submitting" || input.uploadState.status === "uploading") {
    return true;
  }
  if (input.modelsState.status !== "ready" || !input.selectedModel) {
    return true;
  }
  return !canSubmitKoreanIdolContactSheet({
    modelCode: input.resolvedModelCode,
    sourceAssetId: input.sourceAssetId,
  });
}

function PanelHeader() {
  return (
    <div className={styles.posterPanelHeader}>
      <span className={styles.appStatus}>内置提示词</span>
      <h1 className={styles.posterHeading}>韩系偶像九宫格</h1>
      <p className={styles.posterLead}>上传参考图，生成身份一致的竖版九宫格写真拼图。</p>
    </div>
  );
}

function NoteInput(props: Readonly<{
  form: KoreanIdolContactSheetForm;
  onFormChange: (form: KoreanIdolContactSheetForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>备注</span>
      <textarea
        className={styles.textarea}
        name="note"
        placeholder="可补充想要的情绪、姿态、光线或服装细节。"
        rows={NOTE_ROWS}
        value={props.form.note}
        onChange={(event) => props.onFormChange({ ...props.form, note: event.target.value })}
      />
    </label>
  );
}

function ModelSelect(props: Readonly<{
  form: KoreanIdolContactSheetForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: KoreanIdolContactSheetForm) => void;
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
