import type { ChangeEvent, FormEvent } from "react";

import type { PublicModelSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

import type {
  PromptImageGenerateAppProps,
  PromptImageGenerateForm,
  PromptImageGenerateState,
} from "./prompt-image-generate-app";
import styles from "./prompt-apps.module.css";

const NOTE_ROWS = 6;

type SubmitDisabledInput = Readonly<{
  canSubmit: PromptImageGenerateAppProps["canSubmit"];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  primary: string;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  state: PromptImageGenerateState;
}>;

export function PromptImageGenerateFormPanel(props: Readonly<{
  app: PromptImageGenerateAppProps;
  form: PromptImageGenerateForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: PromptImageGenerateForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  state: PromptImageGenerateState;
}>) {
  const disabled = isPromptImageGenerateSubmitDisabled({
    canSubmit: props.app.canSubmit,
    modelsState: props.modelsState,
    primary: props.form.primary,
    resolvedModelCode: props.resolvedModelCode,
    selectedModel: props.selectedModel,
    state: props.state,
  });

  return (
    <form className={styles.posterPanel} onSubmit={props.onSubmit}>
      <PanelHeader lead={props.app.lead} title={props.app.headerTitle} />
      <PrimaryInput form={props.form} app={props.app} onFormChange={props.onFormChange} />
      <NoteInput form={props.form} notePlaceholder={props.app.notePlaceholder} onFormChange={props.onFormChange} />
      <ModelSelect
        form={props.form}
        models={props.models}
        modelsState={props.modelsState}
        resolvedModelCode={props.resolvedModelCode}
        onFormChange={props.onFormChange}
      />
      <button className={styles.posterSubmit} disabled={disabled} type="submit">
        {props.state.status === "submitting" ? "生成中" : props.app.submitLabel}
      </button>
    </form>
  );
}

export function isPromptImageGenerateSubmitDisabled(input: SubmitDisabledInput) {
  if (input.state.status === "submitting" || input.modelsState.status !== "ready") {
    return true;
  }
  if (!input.selectedModel) {
    return true;
  }
  return !input.canSubmit({ modelCode: input.resolvedModelCode, primary: input.primary });
}

function PanelHeader(props: Readonly<{ lead: string; title: string }>) {
  return (
    <div className={styles.posterPanelHeader}>
      <span className={styles.appStatus}>内置提示词</span>
      <h1 className={styles.posterHeading}>{props.title}</h1>
      <p className={styles.posterLead}>{props.lead}</p>
    </div>
  );
}

function PrimaryInput(props: Readonly<{
  app: PromptImageGenerateAppProps;
  form: PromptImageGenerateForm;
  onFormChange: (form: PromptImageGenerateForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>{props.app.primaryLabel}</span>
      <input
        className={styles.textInput}
        name={props.app.primaryName}
        placeholder={props.app.primaryPlaceholder}
        required
        value={props.form.primary}
        onChange={(event) => props.onFormChange({ ...props.form, primary: event.target.value })}
      />
    </label>
  );
}

function NoteInput(props: Readonly<{
  form: PromptImageGenerateForm;
  notePlaceholder: string;
  onFormChange: (form: PromptImageGenerateForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>备注</span>
      <textarea
        className={styles.textarea}
        name="note"
        placeholder={props.notePlaceholder}
        rows={NOTE_ROWS}
        value={props.form.note}
        onChange={(event) => props.onFormChange({ ...props.form, note: event.target.value })}
      />
    </label>
  );
}

function ModelSelect(props: Readonly<{
  form: PromptImageGenerateForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: PromptImageGenerateForm) => void;
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
