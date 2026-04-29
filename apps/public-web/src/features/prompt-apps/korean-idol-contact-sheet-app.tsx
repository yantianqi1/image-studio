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
import { useApiResource } from "@/lib/use-api-resource";

import { PosterResultPanel } from "./character-poster-result-panel";
import {
  buildKoreanIdolContactSheetImageRequest,
  getKoreanIdolContactSheetErrorMessage,
  type KoreanIdolContactSheetForm,
  type KoreanIdolContactSheetState,
} from "./korean-idol-contact-sheet-app-state";
import {
  isKoreanIdolContactSheetSubmitDisabled,
  KoreanIdolContactSheetFormPanel,
} from "./korean-idol-contact-sheet-form";
import styles from "./prompt-apps.module.css";

const IMAGE_MIME_PREFIX = "image/";

type KoreanIdolContactSheetController = Readonly<{
  form: KoreanIdolContactSheetForm;
  handleClearSourceImage: () => void;
  handleSourceUpload: (file: File) => Promise<void>;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  imageModels: readonly PublicModelSummary[];
  imageModelsState: ResourceState<readonly PublicModelSummary[]>;
  resolvedModelCode: string;
  selectedModel: PublicModelSummary | null;
  setForm: (form: KoreanIdolContactSheetForm) => void;
  sourceImage: GenerationSourceImage | null;
  state: KoreanIdolContactSheetState;
  uploadState: SourceUploadState;
}>;

export function KoreanIdolContactSheetApp() {
  const controller = useKoreanIdolContactSheetController();

  return (
    <AppShell activeHref="/apps" headerTitle="韩系偶像九宫格" leadingAction={<PromptAppBackLink />} workspaceMode>
      <div className={styles.posterWorkspace}>
        <KoreanIdolContactSheetFormPanel
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

function useKoreanIdolContactSheetController(): KoreanIdolContactSheetController {
  const [form, setForm] = useState<KoreanIdolContactSheetForm>({ modelCode: "", note: "" });
  const [sourceImage, setSourceImage] = useState<GenerationSourceImage | null>(null);
  const [uploadState, setUploadState] = useState<SourceUploadState>({ status: "idle" });
  const [state, setState] = useState<KoreanIdolContactSheetState>({ status: "idle" });
  const modelsState = useApiResource(() => publicApi.getModels());
  const imageModelsState = getImageModelsState(modelsState);
  const modelResult = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.modelCode)
    : { imageModels: [], resolvedModelCode: form.modelCode, selectedModel: null };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isKoreanIdolContactSheetSubmitDisabled({
      modelsState: imageModelsState,
      resolvedModelCode: modelResult.resolvedModelCode,
      selectedModel: modelResult.selectedModel,
      sourceAssetId: sourceImage?.assetId ?? null,
      state,
      uploadState,
    })) {
      return;
    }
    await runKoreanIdolContactSheetJob({
      form,
      resolvedModelCode: modelResult.resolvedModelCode,
      sourceAssetId: sourceImage?.assetId ?? null,
      setState,
    });
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

async function runKoreanIdolContactSheetJob(input: Readonly<{
  form: KoreanIdolContactSheetForm;
  resolvedModelCode: string;
  setState: (state: KoreanIdolContactSheetState) => void;
  sourceAssetId: number | null;
}>) {
  input.setState({ status: "submitting" });
  try {
    const request = buildKoreanIdolContactSheetImageRequest(input.form, input.resolvedModelCode, input.sourceAssetId);
    const result = await publicApi.generateImage(request);
    const completed = await waitForImageJobResults(publicApi, result.id);
    input.setState({ status: "success", jobId: completed.job.id, images: imageJobResultsToHistoryImages(completed.results) });
  } catch (error: unknown) {
    input.setState({ status: "error", message: getKoreanIdolContactSheetErrorMessage(error) });
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
    input.setUploadState({ status: "error", message: getKoreanIdolContactSheetErrorMessage(error) });
  }
}
