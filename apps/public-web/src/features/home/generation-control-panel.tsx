"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  MAX_REQUESTED_COUNT,
  MIN_REQUESTED_COUNT,
  type GenerationSourceImage,
  type GenerationState,
  type ImageFormState,
  type SourceUploadState,
} from "@/features/home/generation-workbench.types";
import { ASPECT_RATIO_OPTIONS } from "@/features/home/generation-aspect-ratio";
import { RequestStatus } from "@/features/home/generation-control-extras";
import { GenerationPromptImageUpload } from "@/features/home/generation-prompt-image-upload";
import type { PublicModelSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";
import styles from "./generation-workbench.module.css";

type ControlPanelProps = Readonly<{
  form: ImageFormState;
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  state: GenerationState;
  sourceImage: GenerationSourceImage | null;
  uploadState: SourceUploadState;
  onFormChange: Dispatch<SetStateAction<ImageFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> | void;
  onClearSourceImage: () => void;
  onSourceUpload: (file: File) => Promise<void> | void;
}>;


function clampRequestedCount(value: number) {
  return Math.min(MAX_REQUESTED_COUNT, Math.max(MIN_REQUESTED_COUNT, value));
}

function getSubmitLabel(state: GenerationState) {
  return state.status === "submitting" ? "生成中..." : "生成图像";
}

export function GenerationControlPanel({
  form,
  modelsState,
  resolvedModelCode,
  state,
  sourceImage,
  uploadState,
  onFormChange,
  onSubmit,
  onClearSourceImage,
  onSourceUpload,
}: ControlPanelProps) {
  const isSubmitDisabled =
    state.status === "submitting" ||
    modelsState.status !== "ready" ||
    modelsState.data.length === 0;

  return (
    <aside className={styles.workbenchCard}>
      <form className="grid gap-5" onSubmit={onSubmit}>
        <button className="primary-button min-h-12 w-full text-[15px]" type="submit" disabled={isSubmitDisabled}>
          {state.status === "submitting" ? <span className={styles.spinner} /> : null}
          {getSubmitLabel(state)}
        </button>
        <PromptField
          form={form}
          sourceImage={sourceImage}
          uploadState={uploadState}
          onClearSourceImage={onClearSourceImage}
          onFormChange={onFormChange}
          onSourceUpload={onSourceUpload}
        />
        <ModelField
          modelsState={modelsState}
          resolvedModelCode={resolvedModelCode}
          onFormChange={onFormChange}
        />
        <AspectRatioPicker form={form} onFormChange={onFormChange} />
        <QuantityControl form={form} onFormChange={onFormChange} />
        <RequestStatus modelsState={modelsState} state={state} />
      </form>
    </aside>
  );
}

function PromptField({
  form,
  sourceImage,
  uploadState,
  onClearSourceImage,
  onFormChange,
  onSourceUpload,
}: Readonly<{
  form: ImageFormState;
  sourceImage: GenerationSourceImage | null;
  uploadState: SourceUploadState;
  onClearSourceImage: () => void;
  onFormChange: Dispatch<SetStateAction<ImageFormState>>;
  onSourceUpload: (file: File) => Promise<void> | void;
}>) {
  return (
    <label className="grid gap-2 text-sm font-medium text-gray-900">
      <span>提示词</span>
      <span className="text-xs font-normal leading-5 text-gray-500">
        描述你想生成的图像，越详细越好...
      </span>
      <div className={styles.textareaShell}>
        <textarea
          className="min-h-36 w-full resize-y bg-transparent text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400"
          name="prompt"
          placeholder="黄昏港口，蒸汽列车穿过潮湿雾气，电影感光影"
          required
          value={form.prompt}
          onChange={(event) =>
            onFormChange((current) => ({ ...current, prompt: event.target.value }))
          }
        />
        <div className="flex items-center justify-end border-t border-gray-100 pt-2 text-xs text-gray-400">
          <button
            className="rounded-full px-2 py-1 transition-colors hover:bg-gray-100 hover:text-gray-700"
            type="button"
            onClick={() => onFormChange((current) => ({ ...current, prompt: "" }))}
          >
            清空
          </button>
        </div>
        <GenerationPromptImageUpload
          sourceImage={sourceImage}
          uploadState={uploadState}
          onClear={onClearSourceImage}
          onUpload={onSourceUpload}
        />
      </div>
    </label>
  );
}

function ModelField({
  modelsState,
  resolvedModelCode,
  onFormChange,
}: Readonly<{
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  onFormChange: Dispatch<SetStateAction<ImageFormState>>;
}>) {
  return (
    <label className="grid gap-2 text-sm font-medium text-gray-900">
      模型
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">✦</span>
        <select
          className="form-control pl-9"
          name="model_code"
          value={resolvedModelCode}
          disabled={modelsState.status !== "ready" || modelsState.data.length === 0}
          required
          onChange={(event) =>
            onFormChange((current) => ({ ...current, model_code: event.target.value }))
          }
        >
          <ModelOptions modelsState={modelsState} />
        </select>
      </div>
    </label>
  );
}

function ModelOptions({
  modelsState,
}: Readonly<{ modelsState: ResourceState<readonly PublicModelSummary[]> }>) {
  if (modelsState.status === "loading") {
    return <option value="">模型列表加载中...</option>;
  }

  if (modelsState.status === "error") {
    return <option value="">模型列表读取失败</option>;
  }

  if (modelsState.data.length === 0) {
    return <option value="">暂无可用模型</option>;
  }

  return modelsState.data.map((model) => (
    <option key={model.id} value={model.code}>
      {model.display_name} ({model.code})
    </option>
  ));
}

function AspectRatioPicker({
  form,
  onFormChange,
}: Readonly<{
  form: ImageFormState;
  onFormChange: Dispatch<SetStateAction<ImageFormState>>;
}>) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-gray-900">尺寸</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5">
        {ASPECT_RATIO_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={form.aspect_ratio === option.value ? `${styles.aspectOption} ${styles.aspectOptionActive}` : styles.aspectOption}
            type="button"
            onClick={() =>
              onFormChange((current) => ({
                ...current,
                aspect_ratio: option.value,
              }))
            }
          >
            <span className="font-semibold">{option.label}</span>
            <span className="text-[11px] text-gray-500">{option.description}</span>
          </button>
        ))}
      </div>

    </div>
  );
}

function QuantityControl({
  form,
  onFormChange,
}: Readonly<{
  form: ImageFormState;
  onFormChange: Dispatch<SetStateAction<ImageFormState>>;
}>) {
  const updateCount = (value: number) => {
    onFormChange((current) => ({
      ...current,
      requested_count: clampRequestedCount(value),
    }));
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-900" htmlFor="requested_count_range">数量</label>
        <input
          className="h-9 w-16 rounded-xl border border-gray-200 bg-white text-center text-sm font-medium outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-100"
          max={MAX_REQUESTED_COUNT}
          min={MIN_REQUESTED_COUNT}
          name="requested_count"
          type="number"
          value={form.requested_count}
          onChange={(event) => updateCount(Number(event.target.value || MIN_REQUESTED_COUNT))}
        />
      </div>
      <input
        id="requested_count_range"
        className="accent-gray-900"
        max={MAX_REQUESTED_COUNT}
        min={MIN_REQUESTED_COUNT}
        type="range"
        value={form.requested_count}
        onChange={(event) => updateCount(Number(event.target.value))}
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{MIN_REQUESTED_COUNT}</span>
        <span>{MAX_REQUESTED_COUNT}</span>
      </div>
    </div>
  );
}
