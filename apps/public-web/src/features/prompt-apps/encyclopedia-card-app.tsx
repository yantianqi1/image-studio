"use client";

import Link from "next/link";
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
  buildEncyclopediaCardImageRequest,
  canSubmitEncyclopediaCard,
  type EncyclopediaCardState,
  getEncyclopediaCardErrorMessage,
} from "./encyclopedia-card-app-state";
import { PosterResultPanel } from "./character-poster-result-panel";
import styles from "./prompt-apps.module.css";

const NOTE_ROWS = 6;

type EncyclopediaForm = Readonly<{
  modelCode: string;
  note: string;
  topic: string;
}>;

type EncyclopediaController = Readonly<{
  form: EncyclopediaForm;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  imageModels: readonly PublicModelSummary[];
  imageModelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  setForm: (form: EncyclopediaForm) => void;
  state: EncyclopediaCardState;
}>;

type SubmitDisabledInput = Readonly<{
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  state: EncyclopediaCardState;
  topic: string;
}>;

export function EncyclopediaCardApp() {
  const controller = useEncyclopediaController();

  return (
    <AppShell activeHref="/apps" headerTitle="科普百科图" leadingAction={<PromptAppBackLink />} workspaceMode>
      <div className={styles.posterWorkspace}>
        <EncyclopediaFormPanel
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

function PromptAppBackLink() {
  return (
    <Link aria-label="返回应用中心" className={styles.backLink} href="/apps">
      <span aria-hidden="true">←</span>
      <span>返回</span>
    </Link>
  );
}

function useEncyclopediaController(): EncyclopediaController {
  const [form, setForm] = useState<EncyclopediaForm>({ modelCode: "", note: "", topic: "" });
  const [state, setState] = useState<EncyclopediaCardState>({ status: "idle" });
  const modelsState = useApiResource(() => publicApi.getModels());
  const imageModelsState = getImageModelsState(modelsState);
  const { imageModels, resolvedModelCode, selectedModel } = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.modelCode)
    : { imageModels: [], resolvedModelCode: form.modelCode, selectedModel: null };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldBlockSubmit({ modelsState: imageModelsState, resolvedModelCode, selectedModel, state, topic: form.topic })) {
      return;
    }
    setState({ status: "submitting" });
    try {
      const result = await publicApi.generateImage(buildEncyclopediaCardImageRequest(form, resolvedModelCode));
      const completed = await waitForImageJobResults(publicApi, result.id);
      setState({ status: "success", jobId: completed.job.id, images: imageJobResultsToHistoryImages(completed.results) });
    } catch (error: unknown) {
      setState({ status: "error", message: getEncyclopediaCardErrorMessage(error) });
    }
  }

  return { form, handleSubmit, imageModels, imageModelsState, resolvedModelCode, selectedModel, setForm, state };
}

function EncyclopediaFormPanel(props: Readonly<{
  form: EncyclopediaForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: EncyclopediaForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  state: EncyclopediaCardState;
}>) {
  const disabled = shouldBlockSubmit({
    modelsState: props.modelsState,
    resolvedModelCode: props.resolvedModelCode,
    selectedModel: props.selectedModel,
    state: props.state,
    topic: props.form.topic,
  });

  return (
    <form className={styles.posterPanel} onSubmit={props.onSubmit}>
      <PanelHeader />
      <TopicInput form={props.form} onFormChange={props.onFormChange} />
      <NoteInput form={props.form} onFormChange={props.onFormChange} />
      <ModelSelect
        form={props.form}
        models={props.models}
        modelsState={props.modelsState}
        onFormChange={props.onFormChange}
        resolvedModelCode={props.resolvedModelCode}
      />
      <button className={styles.posterSubmit} disabled={disabled} type="submit">
        {props.state.status === "submitting" ? "生成中" : "生成百科图"}
      </button>
    </form>
  );
}

function PanelHeader() {
  return (
    <div className={styles.posterPanelHeader}>
      <span className={styles.appStatus}>内置提示词</span>
      <h1 className={styles.posterHeading}>科普百科图</h1>
      <p className={styles.posterLead}>输入主题词，生成竖版模块化科普信息图。</p>
    </div>
  );
}

function TopicInput(props: Readonly<{
  form: EncyclopediaForm;
  onFormChange: (form: EncyclopediaForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>主题</span>
      <input
        className={styles.textInput}
        name="topic"
        placeholder="例如：狸花猫"
        required
        value={props.form.topic}
        onChange={(event) => props.onFormChange({ ...props.form, topic: event.target.value })}
      />
    </label>
  );
}

function NoteInput(props: Readonly<{
  form: EncyclopediaForm;
  onFormChange: (form: EncyclopediaForm) => void;
}>) {
  return (
    <label className={styles.fieldGroup}>
      <span>备注</span>
      <textarea
        className={styles.textarea}
        name="note"
        placeholder="可补充受众、栏目重点或想突出的知识方向。"
        rows={NOTE_ROWS}
        value={props.form.note}
        onChange={(event) => props.onFormChange({ ...props.form, note: event.target.value })}
      />
    </label>
  );
}

function ModelSelect(props: Readonly<{
  form: EncyclopediaForm;
  models: readonly PublicModelSummary[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  onFormChange: (form: EncyclopediaForm) => void;
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
  return !canSubmitEncyclopediaCard({ modelCode: input.resolvedModelCode, topic: input.topic });
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
