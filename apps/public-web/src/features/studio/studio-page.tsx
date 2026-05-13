"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  imageJobResultsToHistoryImages,
  waitForImageJobResults,
} from "@/features/studio/studio-job-polling";
import { resolveImageModel } from "@/features/studio/studio-models";
import { AppShell } from "@/features/shell/app-shell";
import { StudioComposer } from "@/features/studio/studio-composer";
import { StudioPromptMarket } from "@/features/studio/studio-prompt-market";
import type { StudioPreset } from "@/features/studio/studio-presets";
import { StudioResults } from "@/features/studio/studio-results";
import { StudioSidebar } from "@/features/studio/studio-sidebar";
import {
  clearTurnProgress,
  getTurnProgressSnapshot,
  setTurnProgress,
  subscribeTurnProgress,
  turnProgressKey,
  type TurnProgress,
} from "@/features/studio/studio-turn-progress";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_COUNT,
  DEFAULT_QUALITY,
  DEFAULT_RESOLUTION,
  type ComposerMode,
  type StoredImage,
  type StoredReferenceImage,
  type TurnDraft,
} from "@/features/studio/studio-types";
import { useStudioConversations } from "@/features/studio/use-studio-conversations";
import { publicApi, type ImageAssetVisibility } from "@/lib/public-api";
import { useApiResource } from "@/lib/use-api-resource";
import styles from "./studio-page.module.css";

const SIDEBAR_COLLAPSED_KEY = "commercial_studio_sidebar_collapsed";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

function saveSidebarCollapsed(collapsed: boolean) {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
}

export function StudioPage() {
  // --- Composer state ---
  const [mode, setMode] = useState<ComposerMode>("generate");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [referenceImages, setReferenceImages] = useState<StoredReferenceImage[]>([]);

  // --- UI state ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [promptMarketOpen, setPromptMarketOpen] = useState(false);
  const [progressMap, setProgressMap] = useState<ReadonlyMap<string, TurnProgress>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Data ---
  const conversations = useStudioConversations();
  const modelsState = useApiResource(() => publicApi.getModels());

  // Track active abort controllers for polling
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // --- Sidebar persistence ---
  useEffect(() => {
    setSidebarCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  // --- Progress subscription ---
  useEffect(() => {
    const update = () => setProgressMap(getTurnProgressSnapshot());
    const unsubscribe = subscribeTurnProgress(update);
    return unsubscribe;
  }, []);

  // --- Handlers ---
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isSubmitting) return;

    const resolvedModel =
      modelsState.status === "ready"
        ? resolveImageModel(modelsState.data, model).resolvedModelCode
        : model;

    const draft: TurnDraft = {
      prompt: prompt.trim(),
      model: resolvedModel,
      mode,
      referenceImages,
      count,
      aspectRatio,
      resolution,
      quality,
      visibility: "private",
    };

    const turnId = conversations.addTurn(draft);
    const convId = conversations.activeId;
    if (!convId) return;

    setIsSubmitting(true);
    setPrompt("");

    const progressKey = turnProgressKey(convId, turnId);
    const abortController = new AbortController();
    abortControllersRef.current.set(progressKey, abortController);

    try {
      // Upload reference images that only have dataUrl
      const uploadedRefs = await uploadPendingReferenceImages(referenceImages);
      const referenceAssetIds = uploadedRefs
        .map((img) => img.assetId)
        .filter((id): id is number => id != null);

      setTurnProgress(progressKey, { message: "提交中..." });

      const job = await publicApi.generateImage({
        prompt: draft.prompt,
        model_code: resolvedModel,
        requested_count: count,
        mode: mode === "chat" ? undefined : mode,
        size: resolution,
        quality,
        reference_asset_ids: referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
        visibility: "private",
      });

      conversations.updateTurn(convId, turnId, { status: "generating", taskId: job.id });
      setTurnProgress(progressKey, { message: "生成中..." });

      const startTime = Date.now();
      const completed = await waitForImageJobResults(publicApi, job.id, {
        signal: abortController.signal,
        onJobUpdate: (updatedJob) => {
          if (updatedJob.status === "succeeded") return;
          const elapsed = Date.now() - startTime;
          setTurnProgress(progressKey, { message: "生成中...", elapsedMs: elapsed });
          conversations.updateTurn(convId, turnId, {
            status: "generating",
            taskId: updatedJob.id,
            taskStatus: updatedJob.status,
          });
        },
      });

      const images = imageJobResultsToHistoryImages(completed.results).map((img) => ({
        ...img,
        visibility: img.visibility as ImageAssetVisibility | undefined,
      }));
      conversations.updateTurn(convId, turnId, { status: "success", images });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        conversations.updateTurn(convId, turnId, { status: "cancelled" });
      } else {
        const message = error instanceof Error ? error.message : "生成失败";
        conversations.updateTurn(convId, turnId, { status: "error", error: message });
      }
    } finally {
      clearTurnProgress(progressKey);
      abortControllersRef.current.delete(progressKey);
      setIsSubmitting(false);
      setReferenceImages([]);
    }
  }, [prompt, isSubmitting, modelsState, model, mode, referenceImages, count, aspectRatio, resolution, quality, conversations]);

  const handleCancelTurn = useCallback((turnId: string) => {
    const convId = conversations.activeId;
    if (!convId) return;
    const key = turnProgressKey(convId, turnId);
    const controller = abortControllersRef.current.get(key);
    if (controller) {
      controller.abort();
    }
    conversations.updateTurn(convId, turnId, { status: "cancelled" });
  }, [conversations]);

  const handleRetryTurn = useCallback((turnId: string) => {
    const conv = conversations.activeConversation;
    if (!conv) return;
    const turn = conv.turns.find((t) => t.id === turnId);
    if (!turn) return;
    setPrompt(turn.prompt);
    setModel(turn.model);
    setMode(turn.mode as ComposerMode);
    setAspectRatio(turn.aspectRatio);
    setResolution(turn.resolution);
    setQuality(turn.quality);
    setCount(turn.count);
  }, [conversations]);

  const handleEditFromTurn = useCallback((_turnId: string, image: StoredImage) => {
    const ref: StoredReferenceImage = {
      name: "reference",
      assetId: image.assetId,
      assetUrl: image.url,
      thumbnailUrl: image.thumbnailUrl,
    };
    setReferenceImages((prev) => [...prev, ref]);
    setMode("edit");
  }, []);

  const handleImageVisibilityChange = useCallback(async (assetId: number, visibility: ImageAssetVisibility) => {
    await publicApi.updateImageAssetVisibility(assetId, visibility);
    // Update the turn images in the active conversation
    const conv = conversations.activeConversation;
    if (!conv) return;
    for (const turn of conv.turns) {
      const img = turn.images.find((i) => i.assetId === assetId);
      if (img) {
        const updatedImages = turn.images.map((i) =>
          i.assetId === assetId ? { ...i, visibility } : i,
        );
        conversations.updateTurn(conv.id, turn.id, { images: updatedImages });
        break;
      }
    }
  }, [conversations]);

  const handleApplyPreset = useCallback((preset: StudioPreset) => {
    setPrompt(preset.prompt);
    setAspectRatio(preset.aspectRatio);
    setResolution(preset.resolution);
    setQuality(preset.quality);
    setCount(preset.count);
    setPromptMarketOpen(false);
  }, []);

  const handleReferenceImagesChange = useCallback((images: readonly StoredReferenceImage[]) => {
    setReferenceImages([...images]);
  }, []);

  const handleOpenLightbox = useCallback((_images: readonly StoredImage[], _startIndex: number) => {
    // Lightbox implementation deferred to a separate component
  }, []);

  // --- Layout class ---
  const layoutClass = sidebarCollapsed
    ? `${styles.studioLayout} ${styles.studioLayoutCollapsed}`
    : styles.studioLayout;

  return (
    <AppShell activeHref="/studio" workspaceMode>
      <div className={layoutClass}>
        <StudioSidebar
          conversations={conversations.conversations}
          activeId={conversations.activeId}
          collapsed={sidebarCollapsed}
          onSelect={conversations.selectConversation}
          onNew={conversations.newConversation}
          onDelete={conversations.removeConversation}
          onClearAll={conversations.clearAll}
          onToggleCollapse={handleToggleSidebar}
        />
        <main className={styles.mainArea}>
          <StudioResults
            conversation={conversations.activeConversation}
            progressByTurnKey={progressMap}
            onRetryTurn={handleRetryTurn}
            onEditFromTurn={handleEditFromTurn}
            onCancelTurn={handleCancelTurn}
            onImageVisibilityChange={handleImageVisibilityChange}
            onOpenLightbox={handleOpenLightbox}
          />
          <StudioComposer
            mode={mode}
            prompt={prompt}
            model={model}
            aspectRatio={aspectRatio}
            resolution={resolution}
            quality={quality}
            count={count}
            referenceImages={referenceImages}
            modelsState={modelsState}
            isSubmitting={isSubmitting}
            onModeChange={setMode}
            onPromptChange={setPrompt}
            onModelChange={setModel}
            onAspectRatioChange={setAspectRatio}
            onResolutionChange={setResolution}
            onQualityChange={setQuality}
            onCountChange={setCount}
            onReferenceImagesChange={handleReferenceImagesChange}
            onSubmit={handleSubmit}
            onOpenPromptMarket={() => setPromptMarketOpen(true)}
          />
        </main>
      </div>
      <StudioPromptMarket
        open={promptMarketOpen}
        onClose={() => setPromptMarketOpen(false)}
        onApply={handleApplyPreset}
      />
    </AppShell>
  );
}

async function uploadPendingReferenceImages(
  images: readonly StoredReferenceImage[],
): Promise<StoredReferenceImage[]> {
  const results: StoredReferenceImage[] = [];
  for (const img of images) {
    if (img.assetId) {
      results.push(img);
      continue;
    }
    if (!img.dataUrl) {
      results.push(img);
      continue;
    }
    // Convert dataUrl to File and upload
    const blob = await dataUrlToBlob(img.dataUrl);
    const file = new File([blob], img.name || "reference.png", {
      type: img.mimeType || "image/png",
    });
    const uploaded = await publicApi.uploadImageAsset(file);
    results.push({
      ...img,
      assetId: uploaded.id,
      assetUrl: uploaded.asset_url,
      thumbnailUrl: uploaded.thumbnail_url ?? uploaded.asset_url,
    });
  }
  return results;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
