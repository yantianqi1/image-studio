"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

import {
  imageJobResultsToHistoryImages,
  waitForImageJobResults,
} from "@/features/home/generation-job-polling";
import { resolveImageModel } from "@/features/home/generation-models";
import { getImageModelsState } from "@/features/home/generation-workbench-helpers";
import { AppShell } from "@/features/shell/app-shell";
import type { PublicModelSummary } from "@/lib/public-api";
import { publicApi } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";
import { useApiResource } from "@/lib/use-api-resource";

import {
  buildCharacterPosterImageRequest,
  canSubmitCharacterPoster,
  type CharacterPosterState,
  getCharacterPosterErrorMessage,
} from "./character-poster-app-state";
import { PosterResultPanel } from "./character-poster-result-panel";
import styles from "./prompt-apps.module.css";

const NOTE_ROWS = 6;

type PosterForm = Readonly<{
  character: string;
  note: string;
  modelCode: string;
}>;

type CharacterPosterController = Readonly<{
  form: PosterForm;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  imageModels: readonly PublicModelSummary[];
  imageModelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  setForm: (form: PosterForm) => void;
  state: CharacterPosterState;
}>;

type SubmitDisabledInput = Readonly<{
  character: string;
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  state: CharacterPosterState;
}>;

export function CharacterPosterApp() {
  const controller = useCharacterPosterController();

  return (
    <AppShell activeHref="/apps" headerTitle="角色海报" workspaceMode>
      <div className={styles.posterWorkspace}>
        <PosterFormPanel
          form={controller.form}
          models={controller.imageModels}
          modelsState={controller.imageModelsState}
          resolvedModelCode={controller.resolvedModelCode}
          selectedModel={controller.selectedModel}
          state={controller.state}
          onFormChange={controller.setForm}
          onSubmit={controller.handleSubmit}
        />
        <PosterResultPanel state={controller.state} />
      </div>
    </AppShell>
  );
}

function useCharacterPosterController(): CharacterPosterController {
  const [form, setForm] = useState<PosterForm>({ character: "", note: "", modelCode: "" });
  const [state, setState] = useState<CharacterPosterState>({ status: "idle" });
  const modelsState = useApiResource(() => publicApi.getModels());
  const imageModelsState = getImageModelsState(modelsState);
  const { imageModels, resolvedModelCode, selectedModel } = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.modelCode)
    : { imageModels: [], resolvedModelCode: form.modelCode, selectedModel: null };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldBlockSubmit({ character: form.character, modelsState: imageModelsState, resolvedModelCode, selectedModel, state })) {
      return;
    }
    setState({ status: "submitting" });
    try {
      const result = await publicApi.generateImage(buildCharacterPosterImageRequest(form, resolvedModelCode));
      const completed = await waitForImageJobResults(publicApi, result.id);
      setState({ status: "success", jobId: completed.job.id, images: imageJobResultsToHistoryImages(completed.results) });
    } catch (error: unknown) {
      setState({ status: "error", message: getCharacterPosterErrorMessage(error) });
    }
  }

  return {
    form,
    handleSubmit,
    imageModels,
    imageModelsState,
    resolvedModelCode,
    selectedModel,
    setForm,
    state,
  };
}

function PosterFormPanel(props: Readonly<{
  form: PosterForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: PosterForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  state: CharacterPosterState;
}>) {
  const disabled = shouldBlockSubmit({
    character: props.form.character,
    modelsState: props.modelsState,
    resolvedModelCode: props.resolvedModelCode,
    selectedModel: props.selectedModel,
    state: props.state,
  });

  return (
    <form className={styles.posterPanel} onSubmit={props.onSubmit}>
      <div className={styles.posterPanelHeader}>
        <span className={styles.appStatus}>内置提示词</span>
        <h1 className={styles.posterHeading}>角色海报</h1>
        <p className={styles.posterLead}>输入角色信息，生成横版二次元插画海报。</p>
      </div>
      <CharacterInput form={props.form} onFormChange={props.onFormChange} />
      <NoteInput form={props.form} onFormChange={props.onFormChange} />
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

function CharacterInput(props: Readonly<{
  form: PosterForm;
  onFormChange: (form: PosterForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>角色</span>
      <input
        className={styles.textInput}
        name="character"
        placeholder="例如：张夏"
        required
        value={props.form.character}
        onChange={(event) => props.onFormChange({ ...props.form, character: event.target.value })}
      />
    </label>
  );
}

function NoteInput(props: Readonly<{
  form: PosterForm;
  onFormChange: (form: PosterForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>备注</span>
      <textarea
        className={styles.textarea}
        name="note"
        placeholder="可补充作品、身份、场景或风格倾向。"
        rows={NOTE_ROWS}
        value={props.form.note}
        onChange={(event) => props.onFormChange({ ...props.form, note: event.target.value })}
      />
    </label>
  );
}

function ModelSelect(props: Readonly<{
  form: PosterForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: PosterForm) => void;
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

function shouldBlockSubmit(input: SubmitDisabledInput) {
  if (input.state.status === "submitting" || input.modelsState.status !== "ready") {
    return true;
  }
  if (!input.selectedModel) {
    return true;
  }
  return !canSubmitCharacterPoster({
    character: input.character,
    modelCode: input.resolvedModelCode,
  });
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
