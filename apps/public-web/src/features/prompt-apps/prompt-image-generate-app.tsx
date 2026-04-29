"use client";

import Link from "next/link";
import type { FormEvent } from "react";
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
  isPromptImageGenerateSubmitDisabled,
  PromptImageGenerateFormPanel,
} from "./prompt-image-generate-form";
import { PromptAppResultPanel } from "./prompt-app-result-panel";
import styles from "./prompt-apps.module.css";

export type PromptImageGenerateForm = Readonly<{
  modelCode: string;
  note: string;
  primary: string;
}>;

export type PromptImageGenerateImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "generate";
}>;

export type PromptImageGenerateImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type PromptImageGenerateState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly PromptImageGenerateImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export type PromptImageGenerateAppProps = Readonly<{
  buildImageRequest: (
    form: PromptImageGenerateForm,
    modelCode: string,
  ) => PromptImageGenerateImageRequest;
  canSubmit: (input: Readonly<{ modelCode: string; primary: string }>) => boolean;
  getErrorMessage: (error: unknown) => string;
  headerTitle: string;
  lead: string;
  notePlaceholder: string;
  primaryLabel: string;
  primaryName: string;
  primaryPlaceholder: string;
  submitLabel: string;
}>;

type PromptImageGenerateController = Readonly<{
  form: PromptImageGenerateForm;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  imageModels: readonly PublicModelSummary[];
  imageModelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  setForm: (form: PromptImageGenerateForm) => void;
  state: PromptImageGenerateState;
}>;

export function PromptImageGenerateApp(props: PromptImageGenerateAppProps) {
  const controller = usePromptImageGenerateController(props);

  return (
    <AppShell activeHref="/apps" headerTitle={props.headerTitle} leadingAction={<PromptAppBackLink />} workspaceMode>
      <div className={styles.posterWorkspace}>
        <PromptImageGenerateFormPanel
          app={props}
          form={controller.form}
          models={controller.imageModels}
          modelsState={controller.imageModelsState}
          resolvedModelCode={controller.resolvedModelCode}
          selectedModel={controller.selectedModel}
          state={controller.state}
          onFormChange={controller.setForm}
          onSubmit={controller.handleSubmit}
        />
        <PromptAppResultPanel altPrefix={props.headerTitle} state={controller.state} />
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

function usePromptImageGenerateController(
  props: PromptImageGenerateAppProps,
): PromptImageGenerateController {
  const [form, setForm] = useState<PromptImageGenerateForm>({ modelCode: "", note: "", primary: "" });
  const [state, setState] = useState<PromptImageGenerateState>({ status: "idle" });
  const modelsState = useApiResource(() => publicApi.getModels());
  const imageModelsState = getImageModelsState(modelsState);
  const modelResult = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.modelCode)
    : { imageModels: [], resolvedModelCode: form.modelCode, selectedModel: null };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPromptImageGenerateSubmitDisabled({
      canSubmit: props.canSubmit,
      modelsState: imageModelsState,
      primary: form.primary,
      resolvedModelCode: modelResult.resolvedModelCode,
      selectedModel: modelResult.selectedModel,
      state,
    })) {
      return;
    }
    await runPromptImageGenerateJob({
      buildImageRequest: props.buildImageRequest,
      form,
      getErrorMessage: props.getErrorMessage,
      resolvedModelCode: modelResult.resolvedModelCode,
      setState,
    });
  }

  return {
    form,
    handleSubmit,
    imageModels: modelResult.imageModels,
    imageModelsState,
    resolvedModelCode: modelResult.resolvedModelCode,
    selectedModel: modelResult.selectedModel,
    setForm,
    state,
  };
}

async function runPromptImageGenerateJob(input: Readonly<{
  buildImageRequest: PromptImageGenerateAppProps["buildImageRequest"];
  form: PromptImageGenerateForm;
  getErrorMessage: PromptImageGenerateAppProps["getErrorMessage"];
  resolvedModelCode: string;
  setState: (state: PromptImageGenerateState) => void;
}>) {
  input.setState({ status: "submitting" });
  try {
    const result = await publicApi.generateImage(input.buildImageRequest(input.form, input.resolvedModelCode));
    const completed = await waitForImageJobResults(publicApi, result.id);
    input.setState({ status: "success", jobId: completed.job.id, images: imageJobResultsToHistoryImages(completed.results) });
  } catch (error: unknown) {
    input.setState({ status: "error", message: input.getErrorMessage(error) });
  }
}
