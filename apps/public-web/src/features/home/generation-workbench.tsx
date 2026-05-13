"use client";
import { useCallback, useEffect, useState, useTransition } from "react";

import { buildAspectRatioPrompt } from "@/features/home/generation-aspect-ratio";
import { GenerationControlPanel } from "@/features/home/generation-control-panel";
import { GenerationHistorySidebar } from "@/features/home/generation-history-sidebar";
import {
  imageJobResultsToHistoryImages,
  shouldResumeImageJobHistory,
  waitForImageJobResults,
} from "@/features/home/generation-job-polling";
import { GenerationResultPanel } from "@/features/home/generation-result-panel";
import { resolveImageModel } from "@/features/home/generation-models";
import {
  buildReusePromptForm,
  useGenerationReusePrompt,
} from "@/features/home/generation-reuse-prompt";
import { uploadReferenceImages } from "@/features/home/generation-upload-reference-images";
import { TopBarActions } from "@/features/home/generation-workbench-nav";
import {
  type GenerationSourceImage,
  type GenerationState,
  type ImageFormState,
  type SourceUploadState,
} from "@/features/home/generation-workbench.types";
import { useGenerationHistory } from "@/features/home/use-generation-history";
import { AppShell } from "@/features/shell/app-shell";
import { publicApi, type ImageAssetVisibility } from "@/lib/public-api";
import { useApiResource } from "@/lib/use-api-resource";
import {
  getFormFromHistory,
  getImageModelsState,
  getReferenceImagesFromHistory,
  getWorkspaceClass,
  getStateFromHistory,
  getWalletLabel,
  INITIAL_FORM,
  readSidebarCollapsed,
  resolveSubmissionModel,
  saveSidebarCollapsed,
} from "@/features/home/generation-workbench-helpers";
import styles from "./generation-workbench.module.css";

const IDLE_STATE: GenerationState = { status: "idle" };
const IDLE_UPLOAD: SourceUploadState = { status: "idle" };

export function GenerationWorkbench() {
  const [form, setForm] = useState<ImageFormState>(INITIAL_FORM);
  const [state, setState] = useState<GenerationState>(IDLE_STATE);
  const [referenceImages, setReferenceImages] = useState<readonly GenerationSourceImage[]>([]);
  const [uploadState, setUploadState] = useState<SourceUploadState>(IDLE_UPLOAD);
  const [historySearch, setHistorySearch] = useState("");
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(false);
  const history = useGenerationHistory();
  const activeHistory = history.activeHistory;
  const completeHistory = history.completeHistory;
  const failHistory = history.failHistory;
  const activeHistoryId = activeHistory?.id ?? null;
  const activeTaskId = activeHistory?.taskId ?? null;
  const shouldPollActiveHistory = shouldResumeImageJobHistory(activeHistory);
  const modelsState = useApiResource(() => publicApi.getModels());
  const imageModelsState = getImageModelsState(modelsState);
  const walletState = useApiResource(() => publicApi.getWalletSummary());
  const { resolvedModelCode, selectedModel } = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.model_code)
    : { resolvedModelCode: form.model_code, selectedModel: null };
  const walletLabel = getWalletLabel(walletState);
  const applyReusePrompt = useCallback((pendingReusePrompt: string) => {
    setForm(buildReusePromptForm(pendingReusePrompt));
    setReferenceImages([]);
    setUploadState(IDLE_UPLOAD);
    setState(IDLE_STATE);
  }, []);

  const [, startTransition] = useTransition();

  useGenerationReusePrompt({
    activeHistory,
    createDraft: history.createDraft,
    hydrated: history.hydrated,
    onApplyPrompt: applyReusePrompt,
  });

  useEffect(() => {
    startTransition(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active history into the editable draft
      setForm(getFormFromHistory(history.activeHistory));
      setReferenceImages(getReferenceImagesFromHistory(history.activeHistory));
      setUploadState(IDLE_UPLOAD);
      setState(getStateFromHistory(history.activeHistory));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset form when user switches history, not on polling updates
  }, [history.activeHistoryId]);

  useEffect(() => {
    if (!history.activeHistory) return;
    const historyState = getStateFromHistory(history.activeHistory);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lightweight sync of generation progress
    setState((current) => {
      if (current.status === historyState.status) return current;
      return historyState;
    });
  }, [history.activeHistory?.status, history.activeHistory?.taskStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore user sidebar preference after mount
    setHistorySidebarCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    saveSidebarCollapsed(historySidebarCollapsed);
  }, [historySidebarCollapsed]);

  useEffect(() => {
    if (!activeHistoryId || !activeTaskId || !shouldPollActiveHistory) {
      return;
    }

    let active = true;
    let lastKnownStatus = activeHistory?.taskStatus ?? null;
    const abortController = new AbortController();
    waitForImageJobResults(publicApi, activeTaskId, {
      signal: abortController.signal,
      onJobUpdate: (job) => {
        if (!active || job.status === "succeeded") {
          return;
        }
        if (job.status === lastKnownStatus) {
          return;
        }
        lastKnownStatus = job.status;
        completeHistory(activeHistoryId, {
          status: "generating",
          taskId: job.id,
          taskStatus: job.status,
        });
      },
    })
      .then((completed) => {
        if (!active) {
          return;
        }
        completeHistory(activeHistoryId, {
          status: "success",
          taskId: completed.job.id,
          taskStatus: completed.job.status,
          errorMessage: null,
          images: imageJobResultsToHistoryImages(completed.results),
        });
        setState({ status: "success", jobId: completed.job.id, taskStatus: completed.job.status });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "生成任务失败";
        failHistory(activeHistoryId, message);
        setState({ status: "error", message });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [activeHistoryId, activeTaskId, shouldPollActiveHistory, completeHistory, failHistory]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submissionModel = resolveSubmissionModel({ imageModelsState, selectedModel });
    if ("error" in submissionModel) {
      setState({ status: "error", message: submissionModel.error });
      return;
    }

    const historyId = history.queueHistory({
      prompt: form.prompt,
      modelCode: resolvedModelCode,
      modelName: submissionModel.model.display_name,
      count: form.requested_count,
      aspectRatio: form.aspect_ratio,
      visibility: "private",
      status: "pending",
      images: [],
      sourceImage: referenceImages[0] ?? null,
      referenceImages,
    });
    setState({ status: "submitting" });

    try {
      const referenceAssetIds = referenceImages.map((image) => image.assetId);
      const result = await publicApi.generateImage({
        prompt: buildAspectRatioPrompt(form.prompt, form.aspect_ratio),
        model_code: resolvedModelCode,
        requested_count: form.requested_count,
        mode: "generate",
        reference_asset_ids: referenceAssetIds,
        visibility: "private",
      });
      history.completeHistory(historyId, {
        status: "generating",
        taskId: result.id,
        taskStatus: result.status,
      });
      const completed = await waitForImageJobResults(publicApi, result.id, {
        onJobUpdate: (job) => {
          if (job.status === "succeeded") {
            return;
          }
          history.completeHistory(historyId, {
            status: "generating",
            taskId: job.id,
            taskStatus: job.status,
          });
        },
      });
      history.completeHistory(historyId, {
        status: "success",
        taskId: completed.job.id,
        taskStatus: completed.job.status,
        errorMessage: null,
        images: imageJobResultsToHistoryImages(completed.results),
      });
      setState({ status: "success", jobId: completed.job.id, taskStatus: completed.job.status });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "创建任务失败";
      history.failHistory(historyId, message);
      setState({ status: "error", message });
    }
  }

  const handleNewGeneration = useCallback(() => {
    history.createDraft();
    setForm(INITIAL_FORM);
    setReferenceImages([]);
    setUploadState(IDLE_UPLOAD);
    setState(IDLE_STATE);
  }, [history.createDraft]);

  const handleReferenceUpload = useCallback(async (files: readonly File[]) => {
    setUploadState({ status: "uploading" });
    try {
      const uploadedImages = await uploadReferenceImages(files);
      setReferenceImages((current) => [...current, ...uploadedImages]);
      setUploadState(IDLE_UPLOAD);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "参考图上传失败";
      setUploadState({ status: "error", message });
    }
  }, []);

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setReferenceImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const handleUseResultAsSource = useCallback((image: GenerationSourceImage) => {
    setReferenceImages((current) => [...current, image]);
    setUploadState(IDLE_UPLOAD);
  }, []);

  const handleImageVisibilityChange = useCallback((
    assetId: number,
    visibility: ImageAssetVisibility,
    publishedAt: string | null,
  ) => {
    if (!activeHistory) {
      return;
    }

    completeHistory(activeHistory.id, {
      images: activeHistory.images.map((image) =>
        image.assetId === assetId ? { ...image, visibility, publishedAt } : image,
      ),
    });
  }, [activeHistory, completeHistory]);

  const handleClearReferenceImages = useCallback(() => setReferenceImages([]), []);
  const handleToggleCollapsed = useCallback(() => setHistorySidebarCollapsed((current) => !current), []);

  return (
    <AppShell
      activeHref="/generate"
      navAside={<TopBarActions walletLabel={walletLabel} />}
      workspaceMode
    >
      <div className={getWorkspaceClass(styles, historySidebarCollapsed)}>
        <GenerationHistorySidebar
          activeHistoryId={history.activeHistoryId}
          collapsed={historySidebarCollapsed}
          histories={history.histories}
          searchQuery={historySearch}
          walletLabel={walletLabel}
          onDeleteHistory={history.removeHistory}
          onNewGeneration={handleNewGeneration}
          onRenameHistory={history.renameHistory}
          onSearchQueryChange={setHistorySearch}
          onSelectHistory={history.selectHistory}
          onToggleCollapsed={handleToggleCollapsed}
        />
        <div className={styles.controlColumn}>
          <GenerationControlPanel
            form={form}
            modelsState={imageModelsState}
            resolvedModelCode={resolvedModelCode}
            state={state}
            referenceImages={referenceImages}
            uploadState={uploadState}
            onClearReferenceImages={handleClearReferenceImages}
            onRemoveReferenceImage={handleRemoveReferenceImage}
            onFormChange={setForm}
            onReferenceUpload={handleReferenceUpload}
            onSubmit={handleSubmit}
          />
        </div>
        <div className={styles.resultColumn}>
          <GenerationResultPanel
            historyItem={history.activeHistory}
            state={state}
            onImageVisibilityChange={handleImageVisibilityChange}
            onUseAsSourceImage={handleUseResultAsSource}
          />
        </div>
      </div>
    </AppShell>
  );
}
