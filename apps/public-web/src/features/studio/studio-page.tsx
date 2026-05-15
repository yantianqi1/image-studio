"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History, MessageSquarePlus } from "lucide-react";

import {
  imageJobResultsToHistoryImages,
  waitForImageJobResults,
  type CompletedImageJob,
} from "@/features/studio/studio-job-polling";
import {
  findModelAspectRatioOption,
  resolveImageModel,
  resolveModelParameterSelection,
} from "@/features/studio/studio-models";
import { AppShell } from "@/features/shell/app-shell";
import { StudioComposer } from "@/features/studio/studio-composer";
import { StudioCharacterLibrary } from "@/features/studio/studio-character-library";
import { StudioPromptMarket } from "@/features/studio/studio-prompt-market";
import type { BananaPrompt } from "@/features/studio/studio-prompt-sources";
import { fetchPromptMarketPrompts } from "@/features/studio/studio-prompt-sources";
import { StudioLightbox } from "@/features/studio/studio-lightbox";
import { StudioResults } from "@/features/studio/studio-results";
import { StudioSidebar } from "@/features/studio/studio-sidebar";
import {
  buildImageJobRequest,
  uploadPendingReferenceImages,
} from "@/features/studio/studio-image-request";
import { resolveStudioDraftMode } from "@/features/studio/studio-request-mode";
import {
  clearTurnProgress,
  getTurnProgressSnapshot,
  setTurnProgress,
  subscribeTurnProgress,
  turnProgressKey,
  type TurnProgress,
} from "@/features/studio/studio-turn-progress";
import { findAspectRatio } from "@/features/studio/studio-options";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_COUNT,
  DEFAULT_QUALITY,
  DEFAULT_RESOLUTION,
  type ComposerMode,
  type StudioConversation,
  type StoredImage,
  type StoredReferenceImage,
  type StudioTurn,
  type TurnDraft,
} from "@/features/studio/studio-types";
import { useStudioConversations } from "@/features/studio/use-studio-conversations";
import {
  clearGeneratePromptParam,
  listenPromptCrafterUsePrompt,
  readGeneratePromptParam,
} from "@/features/prompt-crafter/use-prompt";
import { publicApi, type CharacterLibraryItem, type ImageAssetVisibility } from "@/lib/public-api";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/cn";
import { streamPromptCrafter } from "@/features/prompt-crafter/prompt-crafter-api";
import { buildPromptComplianceInstruction } from "@/features/studio/studio-prompt-actions";

const SIDEBAR_COLLAPSED_KEY = "commercial_studio_sidebar_collapsed";
const SETTINGS_KEY = "commercial_studio_image_settings";

type PersistedSettings = {
  aspectRatio: string;
  resolution: string;
  quality: string;
  count: number;
};

type PollSubmittedImageJobInput = Readonly<{
  abortController?: AbortController;
  conversationId: string;
  initialMessage?: string;
  jobId: number;
  startTime: number;
  turnId: string;
}>;

type SubmitExistingTurnInput = Readonly<{
  contextBeforeTurnId?: string;
  conversation: StudioConversation | null;
  conversationId: string;
  draft: TurnDraft;
  turnId: string;
}>;

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

function saveSidebarCollapsed(collapsed: boolean) {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
}

function readPersistedSettings(): Partial<PersistedSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedSettings>;
  } catch {
    return {};
  }
}

function savePersistedSettings(settings: PersistedSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const TOOL_INSTRUCTION_PATTERNS = [
  /^加载并使用.*工具.*作画[^]*?(?=\n---|\n\n)/i,
  /^(?:请)?(?:使用|调用|加载).*(?:工具|模型|插件).*(?:作画|生成|绘制|创作)[^\n]*/i,
  /^(?:不要|而不是).*(?:分析|给提示词|解释|描述)[^\n]*/i,
];

function cleanPromptText(raw: string): string {
  let text = raw.trim();

  // Remove leading tool instructions (lines before "---" separator)
  const separatorIndex = text.indexOf("\n---");
  if (separatorIndex !== -1) {
    const before = text.slice(0, separatorIndex).trim();
    const after = text.slice(separatorIndex + 4).trim();
    const beforeHasToolInstruction = TOOL_INSTRUCTION_PATTERNS.some((p) => p.test(before));
    if (beforeHasToolInstruction && after.length > 0) {
      text = after;
    }
  }

  // Remove standalone tool instruction lines at the start
  const lines = text.split("\n");
  let startIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    const line = lines[i].trim();
    if (!line || line === "---") {
      startIndex = i + 1;
      continue;
    }
    if (TOOL_INSTRUCTION_PATTERNS.some((p) => p.test(line))) {
      startIndex = i + 1;
      continue;
    }
    break;
  }

  if (startIndex > 0) {
    text = lines.slice(startIndex).join("\n").trim();
  }

  return text || raw.trim();
}

async function validatePreviewImages(prompts: BananaPrompt[]): Promise<BananaPrompt[]> {
  const results = await Promise.allSettled(
    prompts.map((p) =>
      new Promise<BananaPrompt>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(p);
        img.onerror = () => reject();
        img.src = p.preview;
      }),
    ),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

function imageJobResultsToStoredImages(results: CompletedImageJob["results"]): StoredImage[] {
  return imageJobResultsToHistoryImages(results).map((img) => ({
    ...img,
    visibility: img.visibility as ImageAssetVisibility | undefined,
  }));
}

function getImageJobProgressMessage(status: string): string {
  if (status === "queued" || status === "pending") {
    return "排队中...";
  }
  return "生成中...";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException("Studio turn aborted", "AbortError");
  }
}

export function StudioPage() {
  // --- Composer state ---
  const [mode, setMode] = useState<ComposerMode>("generate");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [initialSettings] = useState(readPersistedSettings);
  const [aspectRatio, setAspectRatio] = useState(initialSettings.aspectRatio ?? DEFAULT_ASPECT_RATIO);
  const [resolution, setResolution] = useState(initialSettings.resolution ?? DEFAULT_RESOLUTION);
  const [quality, setQuality] = useState(initialSettings.quality ?? DEFAULT_QUALITY);
  const [count, setCount] = useState(initialSettings.count ?? DEFAULT_COUNT);
  const [referenceImages, setReferenceImages] = useState<StoredReferenceImage[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterLibraryItem | null>(null);

  // --- UI state ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [promptMarketOpen, setPromptMarketOpen] = useState(false);
  const [characterLibraryOpen, setCharacterLibraryOpen] = useState(false);
  const [composerBottomInset, setComposerBottomInset] = useState(0);
  const [progressMap, setProgressMap] = useState<ReadonlyMap<string, TurnProgress>>(new Map());
  const [submittingConversationIds, setSubmittingConversationIds] = useState<ReadonlySet<string>>(() => new Set());

  // --- Data ---
  const conversations = useStudioConversations();
  const modelsState = useApiResource(() => publicApi.getModels());
  const selectedModel =
    modelsState.status === "ready"
      ? resolveImageModel(modelsState.data, model).selectedModel
      : null;

  // --- Preset cards (random 4 from remote market, with valid preview images) ---
  type PresetCard = { id: string; title: string; hint: string; preview: string; aspectRatio: string; count: number; prompt: BananaPrompt };
  const [presetCards, setPresetCards] = useState<PresetCard[]>([]);
  const [isRefreshingPresets, setIsRefreshingPresets] = useState(false);
  const presetsFetchedRef = useRef(false);

  const loadPresets = useCallback(async (signal: AbortSignal) => {
    const prompts = await fetchPromptMarketPrompts(signal);
    const withPreview = prompts.filter((p) => p.preview && !p.isNsfw);
    const shuffled = withPreview.sort(() => Math.random() - 0.5);
    const candidates = shuffled.slice(0, 12);
    const valid = await validatePreviewImages(candidates);
    setPresetCards(valid.slice(0, 4).map((p) => ({
      id: p.id,
      title: p.title,
      hint: p.category + (p.subCategory ? ` · ${p.subCategory}` : ""),
      preview: p.preview,
      aspectRatio: "",
      count: 1,
      prompt: p,
    })));
  }, []);

  useEffect(() => {
    if (presetsFetchedRef.current) return;
    presetsFetchedRef.current = true;
    const controller = new AbortController();
    loadPresets(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [loadPresets]);

  const handleRefreshPresets = useCallback(async () => {
    if (isRefreshingPresets) return;
    setIsRefreshingPresets(true);
    try {
      await loadPresets(new AbortController().signal);
    } catch {
      // ignore
    } finally {
      setIsRefreshingPresets(false);
    }
  }, [isRefreshingPresets, loadPresets]);

  // Track active abort controllers for polling
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pollingTurnKeysRef = useRef<Set<string>>(new Set());
  const isActiveConversationSubmitting = conversations.activeId
    ? submittingConversationIds.has(conversations.activeId)
    : false;

  // --- Sidebar persistence ---
  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileHistoryOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileHistoryOpen]);

  // --- Settings persistence ---
  useEffect(() => {
    savePersistedSettings({ aspectRatio, resolution, quality, count });
  }, [aspectRatio, resolution, quality, count]);

  useEffect(() => {
    if (modelsState.status !== "ready") return;
    const resolved = resolveImageModel(modelsState.data, model);
    if (resolved.resolvedModelCode && resolved.resolvedModelCode !== model) {
      setModel(resolved.resolvedModelCode);
    }
    const next = resolveModelParameterSelection(resolved.selectedModel, {
      aspectRatio,
      resolution,
      quality,
    });
    if (next.aspectRatio !== aspectRatio) setAspectRatio(next.aspectRatio);
    if (next.resolution !== resolution) setResolution(next.resolution);
    if (next.quality !== quality) setQuality(next.quality);
  }, [aspectRatio, modelsState, model, quality, resolution]);

  useEffect(() => {
    const queryPrompt = readGeneratePromptParam();
    if (queryPrompt) {
      window.setTimeout(() => {
        setPrompt(queryPrompt);
        setMode("generate");
        clearGeneratePromptParam();
      }, 0);
    }
    return listenPromptCrafterUsePrompt((nextPrompt) => {
      setPrompt(nextPrompt);
      setMode("generate");
    });
  }, []);

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

  const handleOpenMobileHistory = useCallback(() => {
    setMobileHistoryOpen(true);
  }, []);

  const handleCloseMobileHistory = useCallback(() => {
    setMobileHistoryOpen(false);
  }, []);

  const handleMobileSelectConversation = useCallback((id: string) => {
    conversations.selectConversation(id);
    setMobileHistoryOpen(false);
  }, [conversations]);

  const handleMobileNewConversation = useCallback(() => {
    conversations.newConversation();
    setMobileHistoryOpen(false);
  }, [conversations]);

  const handleAspectRatioChange = useCallback((ratio: string) => {
    setAspectRatio(ratio);
    const option = findModelAspectRatioOption(selectedModel, ratio) ?? findAspectRatio(ratio);
    if (option && option.resolutions.length > 0) {
      setResolution(option.resolutions[0].value);
    }
  }, [selectedModel]);

  const markConversationSubmitting = useCallback((conversationId: string) => {
    setSubmittingConversationIds((prev) => new Set(prev).add(conversationId));
  }, []);

  const clearConversationSubmitting = useCallback((conversationId: string) => {
    setSubmittingConversationIds((prev) => {
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  }, []);

  const pollSubmittedImageJob = useCallback(async (input: PollSubmittedImageJobInput) => {
    const progressKey = turnProgressKey(input.conversationId, input.turnId);
    if (pollingTurnKeysRef.current.has(progressKey)) {
      return;
    }

    const abortController =
      input.abortController
      ?? abortControllersRef.current.get(progressKey)
      ?? new AbortController();
    abortControllersRef.current.set(progressKey, abortController);
    pollingTurnKeysRef.current.add(progressKey);

    if (input.initialMessage) {
      setTurnProgress(progressKey, { message: input.initialMessage });
    }

    try {
      const completed = await waitForImageJobResults(publicApi, input.jobId, {
        signal: abortController.signal,
        onJobUpdate: (updatedJob) => {
          if (updatedJob.status === "succeeded") return;
          const elapsed = Date.now() - input.startTime;
          setTurnProgress(progressKey, {
            message: getImageJobProgressMessage(updatedJob.status),
            elapsedMs: elapsed,
          });
          conversations.updateTurn(input.conversationId, input.turnId, {
            status: "generating",
            taskId: updatedJob.id,
            taskStatus: updatedJob.status,
          });
        },
      });

      conversations.updateTurn(input.conversationId, input.turnId, {
        status: "success",
        taskId: completed.job.id,
        taskStatus: completed.job.status,
        images: imageJobResultsToStoredImages(completed.results),
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message = error instanceof Error ? error.message : "生成失败";
      conversations.updateTurn(input.conversationId, input.turnId, { status: "error", error: message });
    } finally {
      clearTurnProgress(progressKey);
      abortControllersRef.current.delete(progressKey);
      pollingTurnKeysRef.current.delete(progressKey);
    }
  }, [conversations]);

  const resumeImageJobPolling = useCallback((conversationId: string, turn: StudioTurn, jobId: number) => {
    const createdAtMs = new Date(turn.createdAt).getTime();
    void pollSubmittedImageJob({
      conversationId,
      initialMessage: "恢复任务状态...",
      jobId,
      startTime: Number.isNaN(createdAtMs) ? Date.now() : createdAtMs,
      turnId: turn.id,
    });
  }, [pollSubmittedImageJob]);

  useEffect(() => {
    if (!conversations.hydrated) return;
    for (const conversation of conversations.conversations) {
      for (const turn of conversation.turns) {
        if (turn.status !== "queued" && turn.status !== "generating") {
          continue;
        }
        if (!turn.taskId) {
          continue;
        }
        const progressKey = turnProgressKey(conversation.id, turn.id);
        if (abortControllersRef.current.has(progressKey)) {
          continue;
        }
        void resumeImageJobPolling(conversation.id, turn, turn.taskId);
      }
    }
  }, [conversations.conversations, conversations.hydrated, resumeImageJobPolling]);

  const submitExistingTurn = useCallback(async (input: SubmitExistingTurnInput) => {
    const { contextBeforeTurnId, conversation, conversationId: convId, draft, turnId } = input;
    markConversationSubmitting(convId);
    const progressKey = turnProgressKey(convId, turnId);
    const abortController = new AbortController();
    abortControllersRef.current.set(progressKey, abortController);
    let didStartPolling = false;

    try {
      if (draft.referenceImages.length > 0) {
        setTurnProgress(progressKey, { message: "上传参考图..." });
      }
      const uploadedRefs = await uploadPendingReferenceImages(draft.referenceImages, publicApi.uploadImageAsset);
      throwIfAborted(abortController.signal);
      conversations.updateTurn(convId, turnId, { referenceImages: uploadedRefs });

      setTurnProgress(progressKey, { message: "提交生成请求..." });

      const job = await publicApi.generateImage(buildImageJobRequest({
        contextBeforeTurnId,
        draft,
        conversation,
        referenceImages: uploadedRefs,
      }));
      throwIfAborted(abortController.signal);

      conversations.updateTurn(convId, turnId, { status: "generating", taskId: job.id });
      setTurnProgress(progressKey, { message: "已提交，等待生成..." });

      didStartPolling = true;
      void pollSubmittedImageJob({
        abortController,
        conversationId: convId,
        jobId: job.id,
        startTime: Date.now(),
        turnId,
      });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        conversations.updateTurn(convId, turnId, { status: "cancelled" });
      } else {
        const message = error instanceof Error ? error.message : "生成失败";
        conversations.updateTurn(convId, turnId, { status: "error", error: message });
      }
    } finally {
      if (!didStartPolling) {
        clearTurnProgress(progressKey);
        abortControllersRef.current.delete(progressKey);
      }
      clearConversationSubmitting(convId);
    }
  }, [clearConversationSubmitting, conversations, markConversationSubmitting, pollSubmittedImageJob]);

  const submitDraft = useCallback(async (draft: TurnDraft) => {
    const { turnId, conversationId: convId } = conversations.addTurn(draft);
    if (!convId || !turnId) return;

    await submitExistingTurn({
      conversation: conversations.activeConversation,
      conversationId: convId,
      draft,
      turnId,
    });
  }, [conversations, submitExistingTurn]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isActiveConversationSubmitting) return;

    const resolvedModel =
      modelsState.status === "ready"
        ? resolveImageModel(modelsState.data, model).resolvedModelCode
        : model;

    const draft: TurnDraft = {
      prompt: prompt.trim(),
      model: resolvedModel,
      mode: resolveStudioDraftMode({ composerMode: mode, referenceCount: referenceImages.length }),
      referenceImages,
      characterLibraryIds: selectedCharacter ? [selectedCharacter.id] : [],
      characterReferences: selectedCharacter
        ? [{ id: selectedCharacter.id, name: selectedCharacter.name, thumbnailUrl: selectedCharacter.thumbnail_url }]
        : [],
      count,
      aspectRatio,
      resolution,
      quality,
      visibility: "private",
    };

    setPrompt("");
    setReferenceImages([]);
    setSelectedCharacter(null);
    void submitDraft(draft);
  }, [
    prompt,
    isActiveConversationSubmitting,
    modelsState,
    model,
    mode,
    referenceImages,
    selectedCharacter,
    count,
    aspectRatio,
    resolution,
    quality,
    submitDraft,
  ]);

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

  const handleDeleteTurn = useCallback((turnId: string) => {
    const conv = conversations.activeConversation;
    if (!conv) return;
    const key = turnProgressKey(conv.id, turnId);
    const controller = abortControllersRef.current.get(key);
    if (controller) {
      controller.abort();
    }
    clearTurnProgress(key);
    abortControllersRef.current.delete(key);
    conversations.removeTurn(conv.id, turnId);
  }, [conversations]);

  const handleRetryTurn = useCallback((turnId: string) => {
    const conv = conversations.activeConversation;
    if (!conv || submittingConversationIds.has(conv.id)) return;
    const turn = conv.turns.find((t) => t.id === turnId);
    if (!turn) return;
    const draft: TurnDraft = {
      prompt: turn.prompt,
      model: turn.model,
      mode: turn.mode,
      referenceImages: turn.referenceImages,
      characterLibraryIds: turn.characterLibraryIds ?? turn.characterReferences?.map((character) => character.id) ?? [],
      characterReferences: turn.characterReferences ?? [],
      count: turn.count,
      aspectRatio: turn.aspectRatio,
      resolution: turn.resolution,
      quality: turn.quality,
      visibility: turn.visibility,
    };
    conversations.retryTurn(conv.id, turnId);
    void submitExistingTurn({
      contextBeforeTurnId: turn.id,
      conversation: conv,
      conversationId: conv.id,
      draft,
      turnId,
    });
  }, [conversations, submittingConversationIds, submitExistingTurn]);

  const handleComplianceRetryTurn = useCallback(async (turnId: string) => {
    const conv = conversations.activeConversation;
    if (!conv || submittingConversationIds.has(conv.id)) return;
    const turn = conv.turns.find((t) => t.id === turnId);
    if (!turn || !turn.prompt.trim()) return;

    let compliantPrompt = turn.prompt;
    try {
      let result = "";
      const controller = new AbortController();
      await streamPromptCrafter({
        messages: [{ role: "user", content: buildPromptComplianceInstruction(turn.prompt) }],
        signal: controller.signal,
        onChunk: (chunk) => { result += chunk; },
      });
      const trimmed = result.trim();
      if (trimmed) compliantPrompt = trimmed;
    } catch {
      // Fall through with original prompt if compliance rewrite fails
    }

    const draft: TurnDraft = {
      prompt: compliantPrompt,
      model: turn.model,
      mode: turn.mode,
      referenceImages: turn.referenceImages,
      characterLibraryIds: turn.characterLibraryIds ?? turn.characterReferences?.map((character) => character.id) ?? [],
      characterReferences: turn.characterReferences ?? [],
      count: turn.count,
      aspectRatio: turn.aspectRatio,
      resolution: turn.resolution,
      quality: turn.quality,
      visibility: turn.visibility,
    };
    conversations.retryTurn(conv.id, turnId);
    void submitExistingTurn({
      contextBeforeTurnId: turn.id,
      conversation: conv,
      conversationId: conv.id,
      draft,
      turnId,
    });
  }, [conversations, submittingConversationIds, submitExistingTurn]);

  const handleEditFromTurn = useCallback((_turnId: string, image: StoredImage) => {
    const ref: StoredReferenceImage = {
      name: "reference",
      assetId: image.assetId,
      assetUrl: image.url,
      thumbnailUrl: image.thumbnailUrl,
    };
    setReferenceImages((prev) => [...prev, ref]);
    setMode("generate");
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

  const handleApplyPrompt = useCallback((prompt: BananaPrompt) => {
    setPrompt(cleanPromptText(prompt.prompt));
    setMode("generate");
    // If the prompt has reference images, fetch them and set as reference images
    if (prompt.referenceImageUrls.length > 0) {
      const refs: StoredReferenceImage[] = prompt.referenceImageUrls.map((url, i) => ({
        name: `ref-${i + 1}`,
        assetUrl: url,
        thumbnailUrl: url,
      }));
      setReferenceImages(refs);
    }
    setPromptMarketOpen(false);
  }, []);

  const handleApplyPresetCard = useCallback((presetId: string) => {
    const card = presetCards.find((c) => c.id === presetId);
    if (card) {
      handleApplyPrompt(card.prompt);
    }
  }, [presetCards, handleApplyPrompt]);

  const handleReferenceImagesChange = useCallback((images: readonly StoredReferenceImage[]) => {
    setReferenceImages([...images]);
  }, []);

  const handleSelectCharacter = useCallback((item: CharacterLibraryItem) => {
    setSelectedCharacter(item);
    setCharacterLibraryOpen(false);
  }, []);

  const handleComposerFixedHeightChange = useCallback((height: number) => {
    setComposerBottomInset((current) => (current === height ? current : height));
  }, []);

  const [lightbox, setLightbox] = useState<{ images: readonly StoredImage[]; startIndex: number } | null>(null);

  const handleOpenLightbox = useCallback((images: readonly StoredImage[], startIndex: number) => {
    setLightbox({ images, startIndex });
  }, []);

  return (
    <AppShell activeHref="/generate" workspaceMode>
      <div
        className={cn(
          "grid h-full overflow-hidden transition-[grid-template-columns] duration-200 ease-in-out",
          sidebarCollapsed
            ? "grid-cols-1 lg:grid-cols-[56px_minmax(0,1fr)]"
            : "grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]",
        )}
      >
        <div className="hidden h-full min-h-0 lg:block">
          <StudioSidebar
            conversations={conversations.conversations}
            activeId={conversations.activeId}
            collapsed={sidebarCollapsed}
            onSelect={conversations.selectConversation}
            onNew={() => conversations.newConversation()}
            onDelete={conversations.removeConversation}
            onClearAll={conversations.clearAll}
            onToggleCollapse={handleToggleSidebar}
          />
        </div>
        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <MobileStudioToolbar
            activeTitle={conversations.activeConversation?.title ?? "新对话"}
            conversationCount={conversations.conversations.length}
            onNew={handleMobileNewConversation}
            onOpenHistory={handleOpenMobileHistory}
          />
          <StudioResults
            conversation={conversations.activeConversation}
            progressByTurnKey={progressMap}
            bottomInset={composerBottomInset}
            presetCards={presetCards}
            isRefreshingPresets={isRefreshingPresets}
            onRetryTurn={handleRetryTurn}
            onComplianceRetryTurn={handleComplianceRetryTurn}
            onEditFromTurn={handleEditFromTurn}
            onCancelTurn={handleCancelTurn}
            onDeleteTurn={handleDeleteTurn}
            onImageVisibilityChange={handleImageVisibilityChange}
            onOpenLightbox={handleOpenLightbox}
            onApplyPreset={handleApplyPresetCard}
            onRefreshPresets={handleRefreshPresets}
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
            selectedCharacter={selectedCharacter}
            modelsState={modelsState}
            selectedModel={selectedModel}
            isSubmitting={isActiveConversationSubmitting}
            onModeChange={setMode}
            onPromptChange={setPrompt}
            onModelChange={setModel}
            onAspectRatioChange={handleAspectRatioChange}
            onResolutionChange={setResolution}
            onQualityChange={setQuality}
            onCountChange={setCount}
            onReferenceImagesChange={handleReferenceImagesChange}
            onClearCharacter={() => setSelectedCharacter(null)}
            onSubmit={handleSubmit}
            onFixedHeightChange={handleComposerFixedHeightChange}
            onOpenPromptMarket={() => setPromptMarketOpen(true)}
            onOpenCharacterLibrary={() => setCharacterLibraryOpen(true)}
          />
        </main>
      </div>
      <StudioPromptMarket
        open={promptMarketOpen}
        onOpenChange={setPromptMarketOpen}
        onApplyPrompt={handleApplyPrompt}
      />
      <StudioCharacterLibrary
        open={characterLibraryOpen}
        selectedId={selectedCharacter?.id ?? null}
        onOpenChange={setCharacterLibraryOpen}
        onSelect={handleSelectCharacter}
      />
      <MobileStudioHistoryDrawer
        open={mobileHistoryOpen}
        conversations={conversations.conversations}
        activeId={conversations.activeId}
        onSelect={handleMobileSelectConversation}
        onNew={handleMobileNewConversation}
        onDelete={conversations.removeConversation}
        onClearAll={conversations.clearAll}
        onClose={handleCloseMobileHistory}
      />
      {lightbox && (
        <StudioLightbox
          images={lightbox.images}
          startIndex={lightbox.startIndex}
          onClose={() => setLightbox(null)}
        />
      )}
    </AppShell>
  );
}

function MobileStudioToolbar({
  activeTitle,
  conversationCount,
  onNew,
  onOpenHistory,
}: Readonly<{
  activeTitle: string;
  conversationCount: number;
  onNew: () => void;
  onOpenHistory: () => void;
}>) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-white/80 px-2 py-2 backdrop-blur lg:hidden">
      <button
        type="button"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm"
        onClick={onOpenHistory}
      >
        <History className="size-4" />
        历史
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{activeTitle}</p>
        <p className="text-[11px] leading-4 text-gray-400">{conversationCount} 条记录</p>
      </div>
      <button
        type="button"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm"
        onClick={onNew}
        aria-label="新建对话"
        title="新建对话"
      >
        <MessageSquarePlus className="size-4" />
      </button>
    </div>
  );
}

function MobileStudioHistoryDrawer({
  open,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  onClose,
}: Readonly<{
  open: boolean;
  conversations: readonly StudioConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}>) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="历史对话">
      <button
        type="button"
        className="absolute inset-0 bg-gray-950/45"
        onClick={onClose}
        aria-label="关闭历史记录"
      />
      <div className="absolute inset-y-0 left-0 flex w-[min(23rem,calc(100vw-1rem))] max-w-full flex-col overflow-hidden bg-white pt-[env(safe-area-inset-top)] shadow-2xl">
        <StudioSidebar
          conversations={conversations}
          activeId={activeId}
          collapsed={false}
          onSelect={onSelect}
          onNew={onNew}
          onDelete={onDelete}
          onClearAll={onClearAll}
          onToggleCollapse={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
