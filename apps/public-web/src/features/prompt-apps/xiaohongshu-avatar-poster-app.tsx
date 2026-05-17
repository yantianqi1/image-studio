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
import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";
import { AppShell } from "@/features/shell/app-shell";
import type { PublicModelSummary } from "@/lib/public-api";
import { publicApi } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";
import { usePublicModels } from "@/lib/use-public-models";

import { PosterResultPanel } from "./character-poster-result-panel";
import {
  buildXiaohongshuAvatarPosterImageRequest,
  getXiaohongshuAvatarPosterErrorMessage,
  type XiaohongshuAvatarPosterForm,
  type XiaohongshuAvatarPosterState,
} from "./xiaohongshu-avatar-poster-app-state";
import {
  isXiaohongshuAvatarPosterSubmitDisabled,
  XiaohongshuAvatarPosterFormPanel,
} from "./xiaohongshu-avatar-poster-form";
import styles from "./prompt-apps.module.css";

const IMAGE_MIME_PREFIX = "image/";

type XiaohongshuAvatarPosterController = Readonly<{
  form: XiaohongshuAvatarPosterForm;
  handleClearSourceImage: () => void;
  handleSourceUpload: (file: File) => Promise<void>;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  imageModels: readonly PublicModelSummary[];
  imageModelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  setForm: (form: XiaohongshuAvatarPosterForm) => void;
  sourceImage: GenerationSourceImage | null;
  state: XiaohongshuAvatarPosterState;
  uploadState: SourceUploadState;
}>;

export function XiaohongshuAvatarPosterApp() {
  const controller = useXiaohongshuAvatarPosterController();

  return (
    <AppShell activeHref="/apps" headerTitle="小红书头像出逃海报" leadingAction={<PromptAppBackLink />} workspaceMode>
      <div className={styles.posterWorkspace}>
        <XiaohongshuAvatarPosterFormPanel
          form={controller.form}
          models={controller.imageModels}
          modelsState={controller.imageModelsState}
          resolvedModelCode={controller.resolvedModelCode}
          selectedModel={controller.selectedModel}
          sourceImage={controller.sourceImage}
          state={controller.state}
          uploadState={controller.uploadState}
          onClearSourceImage={controller.handleClearSourceImage}
          onFormChange={controller.setForm}
          onSourceUpload={controller.handleSourceUpload}
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

function useXiaohongshuAvatarPosterController(): XiaohongshuAvatarPosterController {
  const [form, setForm] = useState<XiaohongshuAvatarPosterForm>({ characterNote: "", modelCode: "" });
  const [sourceImage, setSourceImage] = useState<GenerationSourceImage | null>(null);
  const [uploadState, setUploadState] = useState<SourceUploadState>({ status: "idle" });
  const [state, setState] = useState<XiaohongshuAvatarPosterState>({ status: "idle" });
  const modelsState = usePublicModels();
  const imageModelsState = getImageModelsState(modelsState);
  const modelResult = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.modelCode)
    : { imageModels: [], resolvedModelCode: form.modelCode, selectedModel: null };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceAssetId = sourceImage?.assetId ?? null;
    if (isSubmitBlocked({ imageModelsState, modelResult, sourceAssetId, state, uploadState })) {
      return;
    }
    if (sourceAssetId === null) {
      setState({ status: "error", message: "请先上传小红书主页截图。" });
      return;
    }
    await runXiaohongshuAvatarPosterJob({ form, resolvedModelCode: modelResult.resolvedModelCode, setState, sourceAssetId });
  }

  return {
    form,
    handleClearSourceImage: () => setSourceImage(null),
    handleSourceUpload: (file) => uploadReferenceImage({ file, setSourceImage, setUploadState }),
    handleSubmit,
    imageModels: modelResult.imageModels,
    imageModelsState,
    resolvedModelCode: modelResult.resolvedModelCode,
    selectedModel: modelResult.selectedModel,
    setForm,
    sourceImage,
    state,
    uploadState,
  };
}

function isSubmitBlocked(input: Readonly<{
  imageModelsState: ResourceState<readonly PublicModelSummary[]>;
  modelResult: ReturnType<typeof resolveImageModel> | Readonly<{
    imageModels: readonly PublicModelSummary[];
    resolvedModelCode: string;
    selectedModel: PublicModelSummary | null;
  }>;
  sourceAssetId: number | null;
  state: XiaohongshuAvatarPosterState;
  uploadState: SourceUploadState;
}>) {
  return isXiaohongshuAvatarPosterSubmitDisabled({
    modelsState: input.imageModelsState,
    resolvedModelCode: input.modelResult.resolvedModelCode,
    selectedModel: input.modelResult.selectedModel,
    sourceAssetId: input.sourceAssetId,
    state: input.state,
    uploadState: input.uploadState,
  });
}

async function runXiaohongshuAvatarPosterJob(input: Readonly<{
  form: XiaohongshuAvatarPosterForm;
  resolvedModelCode: string;
  setState: (state: XiaohongshuAvatarPosterState) => void;
  sourceAssetId: number;
}>) {
  input.setState({ status: "submitting" });
  try {
    const request = buildXiaohongshuAvatarPosterImageRequest(input.form, input.resolvedModelCode, input.sourceAssetId);
    const result = await publicApi.generateImage(request);
    const completed = await waitForImageJobResults(publicApi, result.id);
    input.setState({ status: "success", jobId: completed.job.id, images: imageJobResultsToHistoryImages(completed.results) });
  } catch (error: unknown) {
    input.setState({ status: "error", message: getXiaohongshuAvatarPosterErrorMessage(error) });
  }
}

async function uploadReferenceImage(input: Readonly<{
  file: File;
  setSourceImage: (sourceImage: GenerationSourceImage | null) => void;
  setUploadState: (state: SourceUploadState) => void;
}>) {
  if (!input.file.type.startsWith(IMAGE_MIME_PREFIX)) {
    input.setSourceImage(null);
    input.setUploadState({ status: "error", message: "请上传图片文件。" });
    return;
  }
  input.setSourceImage(null);
  input.setUploadState({ status: "uploading" });
  try {
    const uploaded = await publicApi.uploadImageAsset(input.file);
    input.setSourceImage({ assetId: uploaded.id, assetUrl: uploaded.asset_url, mimeType: uploaded.mime_type });
    input.setUploadState({ status: "idle" });
  } catch (error: unknown) {
    input.setUploadState({ status: "error", message: getXiaohongshuAvatarPosterErrorMessage(error) });
  }
}
