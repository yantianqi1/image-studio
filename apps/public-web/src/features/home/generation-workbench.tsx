"use client";

import { useEffect, useState } from "react";

import { buildAspectRatioPrompt } from "@/features/home/generation-aspect-ratio";
import { GenerationControlPanel } from "@/features/home/generation-control-panel";
import { GenerationHistorySidebar } from "@/features/home/generation-history-sidebar";
import { waitForImageJobResults } from "@/features/home/generation-job-polling";
import { GenerationResultPanel } from "@/features/home/generation-result-panel";
import { resolveImageModel } from "@/features/home/generation-models";
import { MobileHistoryButton, TopBarActions } from "@/features/home/generation-workbench-nav";
import {
  type GenerationSourceImage,
  type GenerationState,
  type ImageFormState,
  type SourceUploadState,
} from "@/features/home/generation-workbench.types";
import { useGenerationHistory } from "@/features/home/use-generation-history";
import { AppShell } from "@/features/shell/app-shell";
import {
  publicApi,
} from "@/lib/public-api";
import { useApiResource } from "@/lib/use-api-resource";
import {
  getFormFromHistory,
  getImageModelsState,
  getWorkspaceClass,
  getSiteTitle,
  getStateFromHistory,
  getWalletLabel,
  INITIAL_FORM,
  readSidebarCollapsed,
  saveSidebarCollapsed,
} from "@/features/home/generation-workbench-helpers";
import historyStyles from "./generation-history.module.css";
import styles from "./generation-workbench.module.css";

export function GenerationWorkbench() {
  const [form, setForm] = useState<ImageFormState>(INITIAL_FORM);
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const [sourceImage, setSourceImage] = useState<GenerationSourceImage | null>(null);
  const [uploadState, setUploadState] = useState<SourceUploadState>({ status: "idle" });
  const [historySearch, setHistorySearch] = useState("");
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(false);
  const history = useGenerationHistory();
  const modelsState = useApiResource(() => publicApi.getModels());
  const imageModelsState = getImageModelsState(modelsState);
  const settingsState = useApiResource(() => publicApi.getSiteSettings());
  const walletState = useApiResource(() => publicApi.getWalletSummary());
  const { resolvedModelCode, selectedModel } = imageModelsState.status === "ready"
    ? resolveImageModel(imageModelsState.data, form.model_code)
    : { resolvedModelCode: form.model_code, selectedModel: null };
  const walletLabel = getWalletLabel(walletState);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active history into the editable draft
    setForm(getFormFromHistory(history.activeHistory));
    setSourceImage(history.activeHistory?.sourceImage ?? null);
    setUploadState({ status: "idle" });
    setState(getStateFromHistory(history.activeHistory));
  }, [history.activeHistory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore user sidebar preference after mount
    setHistorySidebarCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    saveSidebarCollapsed(historySidebarCollapsed);
  }, [historySidebarCollapsed]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (imageModelsState.status !== "ready") {
      setState({ status: "error", message: "模型列表尚未就绪，暂时无法提交生成任务。" });
      return;
    }

    if (imageModelsState.data.length === 0) {
      setState({ status: "error", message: "当前没有可用模型，无法创建生成任务。" });
      return;
    }

    if (!selectedModel) {
      setState({ status: "error", message: "所选模型不存在，请重新选择后再提交。" });
      return;
    }

    const historyId = history.queueHistory({
      prompt: form.prompt,
      modelCode: resolvedModelCode,
      modelName: selectedModel.display_name,
      count: form.requested_count,
      aspectRatio: form.aspect_ratio,
      status: "pending",
      images: [],
      sourceImage,
    });
    setState({ status: "submitting" });

    try {
      const result = await publicApi.generateImage({
        prompt: buildAspectRatioPrompt(form.prompt, form.aspect_ratio),
        model_code: resolvedModelCode,
        requested_count: form.requested_count,
        mode: sourceImage ? "edit" : "generate",
        source_asset_id: sourceImage?.assetId,
      });
      history.completeHistory(historyId, {
        status: "generating",
        taskId: result.id,
        taskStatus: result.status,
      });
      const completed = await waitForImageJobResults(publicApi, result.id);
      history.completeHistory(historyId, {
        status: "success",
        taskId: completed.job.id,
        taskStatus: completed.job.status,
        errorMessage: null,
        images: completed.results.map((item) => ({
          id: String(item.id),
          assetId: item.asset_id,
          url: item.asset_url,
        })),
      });
      setState({ status: "success", jobId: completed.job.id, taskStatus: completed.job.status });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "创建任务失败";
      history.failHistory(historyId, message);
      setState({ status: "error", message });
    }
  }

  function handleNewGeneration() {
    history.createDraft();
    setForm(INITIAL_FORM);
    setSourceImage(null);
    setUploadState({ status: "idle" });
    setState({ status: "idle" });
    setHistoryDrawerOpen(false);
  }


  async function handleSourceUpload(file: File) {
    setUploadState({ status: "uploading" });
    try {
      const uploaded = await publicApi.uploadImageAsset(file);
      setSourceImage({
        assetId: uploaded.id,
        assetUrl: uploaded.asset_url,
        mimeType: uploaded.mime_type,
      });
      setUploadState({ status: "idle" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "源图上传失败";
      setUploadState({ status: "error", message });
    }
  }

  function handleUseResultAsSource(image: GenerationSourceImage) {
    setSourceImage(image);
    setUploadState({ status: "idle" });
  }

  return (
    <AppShell
      brandLabel={getSiteTitle(settingsState)}
      leadingAction={<MobileHistoryButton onClick={() => setHistoryDrawerOpen(true)} />}
      navAside={<TopBarActions walletLabel={walletLabel} />}
      workspaceMode
    >
      {historyDrawerOpen ? (
        <>
          <button
            className={`${historyStyles.drawerBackdrop} lg:hidden`}
            type="button"
            aria-label="关闭历史记录抽屉"
            onClick={() => setHistoryDrawerOpen(false)}
          />
          <GenerationHistorySidebar
            activeHistoryId={history.activeHistoryId}
            histories={history.histories}
            isDrawer
            searchQuery={historySearch}
            walletLabel={walletLabel}
            onClose={() => setHistoryDrawerOpen(false)}
            onDeleteHistory={history.removeHistory}
            onNewGeneration={handleNewGeneration}
            onRenameHistory={history.renameHistory}
            onSearchQueryChange={setHistorySearch}
            onSelectHistory={history.selectHistory}
          />
        </>
      ) : null}

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
          onToggleCollapsed={() => setHistorySidebarCollapsed((current) => !current)}
        />
        <div className={styles.controlColumn}>
          <GenerationControlPanel
            form={form}
            modelsState={imageModelsState}
            resolvedModelCode={resolvedModelCode}
            state={state}
            sourceImage={sourceImage}
            uploadState={uploadState}
            onClearSourceImage={() => setSourceImage(null)}
            onFormChange={setForm}
            onSourceUpload={handleSourceUpload}
            onSubmit={handleSubmit}
          />
        </div>
        <div className={styles.resultColumn}>
          <GenerationResultPanel
            historyItem={history.activeHistory}
            state={state}
            onUseAsSourceImage={handleUseResultAsSource}
          />
        </div>
      </div>
    </AppShell>
  );
}
