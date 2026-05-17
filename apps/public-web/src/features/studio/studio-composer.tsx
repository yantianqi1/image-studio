"use client";

import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  MessageCircle,
  Paintbrush,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/formatters";
import { streamPromptCrafter } from "@/features/prompt-crafter/prompt-crafter-api";
import {
  buildPromptComplianceInstruction,
  buildPromptOptimizationInstruction,
} from "@/features/studio/studio-prompt-actions";
import { ASPECT_RATIO_OPTIONS, QUALITY_OPTIONS } from "@/features/studio/studio-options";
import {
  buildModelAspectRatioOptions,
  findModelVariant,
  getModelQualityOptions,
  getModelStartingPriceCents,
} from "@/features/studio/studio-models";
import {
  MAX_COUNT,
  MIN_COUNT,
  type ComposerMode,
  type StoredReferenceImage,
} from "@/features/studio/studio-types";
import type { CharacterLibraryItem, PublicModelSummary } from "@/lib/public-api.types";
import type { ResourceState } from "@/lib/use-api-resource";

type StudioComposerProps = Readonly<{
  mode: ComposerMode;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  count: number;
  referenceImages: readonly StoredReferenceImage[];
  selectedCharacter: CharacterLibraryItem | null;
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  selectedModel: PublicModelSummary | null;
  isSubmitting: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (model: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onResolutionChange: (resolution: string) => void;
  onQualityChange: (quality: string) => void;
  onCountChange: (count: number) => void;
  onReferenceImagesChange: (images: readonly StoredReferenceImage[]) => void;
  onClearCharacter: () => void;
  onSubmit: () => void;
  onFixedHeightChange: (height: number) => void;
  onOpenPromptMarket: () => void;
  onOpenCharacterLibrary: () => void;
}>;

const MODE_OPTIONS: readonly { value: ComposerMode; label: string; icon: typeof MessageCircle }[] = [
  { value: "chat", label: "对话", icon: MessageCircle },
  { value: "generate", label: "生图", icon: Paintbrush },
];

const PROMPT_AREA_MIN_HEIGHT = 76;
const PROMPT_AREA_DEFAULT_HEIGHT = 112;
const PROMPT_AREA_MOBILE_DEFAULT_HEIGHT = 84;
const PROMPT_AREA_MAX_HEIGHT = 320;
const FIXED_COMPOSER_STATIC_MIN_WIDTH_PX = 1024;

function getPromptAreaMaxHeight() {
  if (typeof window === "undefined") return PROMPT_AREA_MAX_HEIGHT;
  const mobileCap = Math.min(180, Math.floor(window.innerHeight * 0.3));
  if (window.innerWidth < 640) {
    return Math.max(PROMPT_AREA_MIN_HEIGHT, mobileCap);
  }
  return Math.max(PROMPT_AREA_MIN_HEIGHT, Math.min(PROMPT_AREA_MAX_HEIGHT, Math.floor(window.innerHeight * 0.42)));
}

function clampPromptAreaHeight(height: number) {
  return Math.min(Math.max(height, PROMPT_AREA_MIN_HEIGHT), getPromptAreaMaxHeight());
}

function getSubmitLabel(mode: ComposerMode, isSubmitting: boolean, hasRefs: boolean) {
  if (isSubmitting) return "处理中";
  if (mode === "chat") return "发送";
  if (hasRefs) return "参考生图";
  return "生成图片";
}

function useFixedComposerHeight(
  composerRootRef: Readonly<{ current: HTMLDivElement | null }>,
  onFixedHeightChange: (height: number) => void,
) {
  useEffect(() => {
    const element = composerRootRef.current;
    if (!element) return;
    let frame = 0;

    const updateFixedHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        onFixedHeightChange(getFixedComposerHeight(element));
      });
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateFixedHeight);
    observer?.observe(element);
    window.addEventListener("resize", updateFixedHeight);
    updateFixedHeight();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateFixedHeight);
    };
  }, [composerRootRef, onFixedHeightChange]);
}

function getFixedComposerHeight(element: HTMLElement) {
  if (window.innerWidth >= FIXED_COMPOSER_STATIC_MIN_WIDTH_PX) return 0;
  const style = window.getComputedStyle(element);
  const height = style.position === "fixed" ? Math.ceil(window.innerHeight - element.getBoundingClientRect().top) : 0;
  return Math.max(0, height);
}

export const StudioComposer = memo(function StudioComposer(props: StudioComposerProps) {
  const {
    prompt,
    model,
    aspectRatio,
    resolution,
    quality,
    count,
    referenceImages,
    selectedCharacter,
    modelsState,
    selectedModel,
    isSubmitting,
    onPromptChange,
    onModelChange,
    onAspectRatioChange,
    onResolutionChange,
    onQualityChange,
    onCountChange,
    onReferenceImagesChange,
    onClearCharacter,
    onSubmit,
    onFixedHeightChange,
    onOpenPromptMarket,
    onOpenCharacterLibrary,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const composerPanelRef = useRef<HTMLDivElement>(null);
  const composerToolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptAreaResizeRef = useRef<{ pointerOffsetY: number } | null>(null);

  const [promptAreaHeight, setPromptAreaHeight] = useState(PROMPT_AREA_DEFAULT_HEIGHT);
  const [isPromptAreaResizing, setIsPromptAreaResizing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isComplianceRunning, setIsComplianceRunning] = useState(false);
  const [complianceSuccess, setComplianceSuccess] = useState(false);
  const [isOptimizationRunning, setIsOptimizationRunning] = useState(false);
  const [optimizationSuccess, setOptimizationSuccess] = useState(false);
  const [promptToolError, setPromptToolError] = useState("");
  const complianceAbortRef = useRef<AbortController | null>(null);
  const optimizationAbortRef = useRef<AbortController | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const settingsContainerRef = useRef<HTMLDivElement>(null);
  useFixedComposerHeight(composerRootRef, onFixedHeightChange);

  const modelAspectRatios = buildModelAspectRatioOptions(selectedModel);
  const aspectRatioOptions = modelAspectRatios.length > 0 ? modelAspectRatios : ASPECT_RATIO_OPTIONS;
  const activeRatio = aspectRatioOptions.find((o) => o.value === aspectRatio);
  const resolutions = activeRatio?.resolutions ?? [];
  const modelQualityOptions = getModelQualityOptions(selectedModel, resolution);
  const qualityOptions = modelQualityOptions.length > 0 ? modelQualityOptions : QUALITY_OPTIONS;
  const activeVariant = findModelVariant(selectedModel, resolution, quality);
  const activeBasePriceLabel = activeVariant
    ? formatCredits(activeVariant.member_price_cents / 10)
    : selectedModel
      ? formatCredits(selectedModel.member_price_cents / 10)
      : "";
  const isDisabled = isSubmitting || !prompt.trim() || modelsState.status !== "ready";
  const submitLabel = getSubmitLabel("generate", isSubmitting, referenceImages.length > 0);

  // Close model menu on outside click
  useEffect(() => {
    if (!isModelMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isModelMenuOpen]);

  // Close settings panel on outside click
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsContainerRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isSettingsOpen]);

  // Resize cursor effect
  useEffect(() => {
    if (!isPromptAreaResizing) return;
    const prev = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = prevSelect;
    };
  }, [isPromptAreaResizing]);

  // Window resize clamp
  useEffect(() => {
    const handleResize = () => {
      setPromptAreaHeight((height) => {
        if (window.innerWidth < 640 && height === PROMPT_AREA_DEFAULT_HEIGHT) {
          return PROMPT_AREA_MOBILE_DEFAULT_HEIGHT;
        }
        return clampPromptAreaHeight(height);
      });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      complianceAbortRef.current?.abort();
      optimizationAbortRef.current?.abort();
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!isSubmitting && prompt.trim()) onSubmit();
      }
    },
    [isSubmitting, onSubmit, prompt],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      event.preventDefault();
      const newImages: StoredReferenceImage[] = [];
      for (const file of imageFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        newImages.push({ name: file.name || "pasted-image.png", dataUrl, mimeType: file.type });
      }
      onReferenceImagesChange([...referenceImages, ...newImages]);
    },
    [onReferenceImagesChange, referenceImages],
  );

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;
      const newImages: StoredReferenceImage[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        newImages.push({ name: file.name, dataUrl, mimeType: file.type });
      }
      onReferenceImagesChange([...referenceImages, ...newImages]);
      event.target.value = "";
    },
    [onReferenceImagesChange, referenceImages],
  );

  const handleRemoveReference = useCallback(
    (index: number) => {
      const next = referenceImages.filter((_, i) => i !== index);
      onReferenceImagesChange(next);
    },
    [onReferenceImagesChange, referenceImages],
  );

  const handlePromptResizeStart = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handleRect = event.currentTarget.getBoundingClientRect();
    promptAreaResizeRef.current = { pointerOffsetY: event.clientY - handleRect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPromptAreaResizing(true);
  };

  const handlePromptResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!promptAreaResizeRef.current) return;
    event.preventDefault();
    const panelRect = composerPanelRef.current?.getBoundingClientRect();
    const toolbarHeight = composerToolbarRef.current?.getBoundingClientRect().height ?? 0;
    if (!panelRect) return;
    const handleHeight = event.currentTarget.getBoundingClientRect().height;
    const nextHeight = panelRect.bottom - toolbarHeight - handleHeight - event.clientY + promptAreaResizeRef.current.pointerOffsetY;
    setPromptAreaHeight(clampPromptAreaHeight(nextHeight));
  };

  const handlePromptResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (!promptAreaResizeRef.current) return;
    promptAreaResizeRef.current = null;
    setIsPromptAreaResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const modelLabel =
    modelsState.status === "ready"
      ? modelsState.data.find((m) => m.code === model)?.display_name || model
      : "加载中...";

  const handlePromptCompliance = useCallback(async () => {
    if (!prompt.trim() || isComplianceRunning) return;
    setIsComplianceRunning(true);
    setComplianceSuccess(false);
    setPromptToolError("");
    complianceAbortRef.current = new AbortController();

    try {
      const result = await collectPromptRewrite(
        buildPromptComplianceInstruction(prompt),
        complianceAbortRef.current.signal,
      );
      onPromptChange(result);
      setComplianceSuccess(true);
      setTimeout(() => setComplianceSuccess(false), 2000);
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        setPromptToolError(error instanceof Error ? error.message : "提示词合规化失败");
      }
    } finally {
      setIsComplianceRunning(false);
      complianceAbortRef.current = null;
    }
  }, [prompt, isComplianceRunning, onPromptChange]);

  const handlePromptOptimization = useCallback(async () => {
    if (!prompt.trim() || isOptimizationRunning) return;
    setIsOptimizationRunning(true);
    setOptimizationSuccess(false);
    setPromptToolError("");
    optimizationAbortRef.current = new AbortController();
    try {
      const result = await collectPromptRewrite(
        buildPromptOptimizationInstruction(prompt),
        optimizationAbortRef.current.signal,
      );
      onPromptChange(result);
      setOptimizationSuccess(true);
      setTimeout(() => setOptimizationSuccess(false), 2000);
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        setPromptToolError(error instanceof Error ? error.message : "提示词优化失败");
      }
    } finally {
      setIsOptimizationRunning(false);
      optimizationAbortRef.current = null;
    }
  }, [prompt, isOptimizationRunning, onPromptChange]);

  return (
    <div ref={composerRootRef} className="fixed inset-x-3 bottom-3 z-30 mx-auto w-auto max-w-3xl shrink-0 px-0 pb-0 pt-1 sm:inset-x-4 sm:bottom-4 lg:static lg:w-full lg:px-4 lg:pb-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Selected character and reference images row */}
      {(selectedCharacter || referenceImages.length > 0) && (
        <div className="mb-2 flex max-h-20 gap-2 overflow-x-auto px-1 py-1 sm:mb-3">
          {selectedCharacter ? (
            <div className="relative flex h-14 min-w-48 max-w-60 shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 shadow-sm sm:h-16">
              <img
                src={selectedCharacter.thumbnail_url}
                alt={selectedCharacter.name}
                className="size-10 rounded-lg object-cover sm:size-11"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                {selectedCharacter.name}
              </span>
              <button
                type="button"
                onClick={onClearCharacter}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="移除形象"
                title="移除形象"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          {referenceImages.map((img, index) => (
            <div key={img.name + index} className="relative size-14 shrink-0 sm:size-16">
              <button
                type="button"
                className="group size-14 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition hover:border-gray-300 sm:size-16"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl || img.assetUrl || img.thumbnailUrl || ""}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveReference(index)}
                className="absolute -right-1 -top-1 z-10 inline-flex size-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-gray-300 hover:text-gray-800"
                aria-label={`移除 ${img.name}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main composer panel */}
      <div
        ref={composerPanelRef}
        className="relative overflow-visible rounded-[24px] border border-gray-200 bg-white/95 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:border-gray-100 sm:shadow-[0_24px_80px_-34px_rgba(15,23,42,0.3)]"
      >
        {/* Resize handle */}
        <button
          type="button"
          className={cn(
            "hidden h-4 w-full cursor-[ns-resize] touch-none select-none items-center justify-center rounded-t-[24px] focus-visible:outline-none sm:flex",
            isPromptAreaResizing && "cursor-row-resize",
          )}
          onPointerDown={handlePromptResizeStart}
          onPointerMove={handlePromptResizeMove}
          onPointerUp={handlePromptResizeEnd}
          onPointerCancel={handlePromptResizeEnd}
          onLostPointerCapture={() => {
            promptAreaResizeRef.current = null;
            setIsPromptAreaResizing(false);
          }}
          aria-label="调整输入区域高度"
          title="拖动调整高度"
        >
          <span className="h-1 w-10 rounded-full bg-gray-300/60" />
        </button>

        {/* Textarea area */}
        <div
          className="cursor-text"
          onClick={() => textareaRef.current?.focus()}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              referenceImages.length > 0
                ? "描述你希望如何修改参考图..."
                : "输入你想要生成的画面，也可直接粘贴图片..."
            }
            className="min-h-[56px] w-full resize-none border-0 bg-transparent px-5 pt-5 pb-2 text-[15px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 sm:min-h-0 sm:px-5 sm:py-4 sm:text-[15px] sm:leading-6"
            style={{ height: promptAreaHeight }}
          />
        </div>

          {/* Toolbar */}
          <div
            ref={composerToolbarRef}
            className="rounded-b-[24px] border-t border-gray-100 bg-white/80 px-3 py-2.5 sm:px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
              {/* Left toolbar */}
              <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2 sm:overflow-visible sm:pb-0 sm:pr-0">
                {/* Model selector */}
                <div ref={modelMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                      isModelMenuOpen && "border-blue-200 bg-blue-50 text-blue-600",
                    )}
                    onClick={() => setIsModelMenuOpen((o) => !o)}
                    aria-expanded={isModelMenuOpen}
                    title={`模型：${modelLabel}`}
                  >
                    <Bot className="size-3.5 shrink-0" />
                    <span className="hidden max-w-[120px] truncate sm:inline">{modelLabel}</span>
                    <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition", isModelMenuOpen && "rotate-180")} />
                  </button>
                  {isModelMenuOpen && modelsState.status === "ready" && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 z-[80] max-h-[45dvh] w-[218px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-lg">
                      {modelsState.data.map((m) => {
                        const active = m.code === model;
                        const priceLabel = formatCredits(getModelStartingPriceCents(m) / 10);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-100",
                              active && "bg-gray-100 font-medium text-gray-900",
                            )}
                            onClick={() => {
                              onModelChange(m.code);
                              setIsModelMenuOpen(false);
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{m.display_name}</span>
                              <span className="block text-[11px] font-medium text-gray-400">基础 {priceLabel}/张起</span>
                            </span>
                            {active && <Check className="size-4 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Prompt market button */}
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                  onClick={onOpenPromptMarket}
                  title="模板市场"
                >
                  <Store className="size-3.5" />
                  <span className="hidden sm:inline">市场</span>
                </button>

                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:bg-gray-50",
                    selectedCharacter
                      ? "border-gray-300 bg-gray-100 text-gray-900"
                      : "border-gray-200 bg-white text-gray-600",
                  )}
                  onClick={onOpenCharacterLibrary}
                  title="形象库"
                >
                  <UserRound className="size-3.5" />
                  <span className="hidden sm:inline">形象库</span>
                </button>

                {/* Settings toggle */}
                <div ref={settingsContainerRef} className="shrink-0 sm:relative">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50",
                        isSettingsOpen && "border-blue-200 bg-blue-50 text-blue-600",
                      )}
                      onClick={() => setIsSettingsOpen((o) => !o)}
                      aria-expanded={isSettingsOpen}
                      title={isSettingsOpen ? "收起参数" : "更多参数"}
                    >
                      <SlidersHorizontal className="size-3.5" />
                      <span className="hidden sm:inline">参数</span>
                    </button>
                    {isSettingsOpen && (
                      <ImageSettingsPopover
                        aspectRatio={aspectRatio}
                        resolution={resolution}
                        quality={quality}
                        count={count}
                        resolutions={resolutions}
                        aspectRatioOptions={aspectRatioOptions}
                        qualityOptions={qualityOptions}
                        priceLabel={activeBasePriceLabel}
                        onAspectRatioChange={onAspectRatioChange}
                        onResolutionChange={onResolutionChange}
                        onQualityChange={onQualityChange}
                        onCountChange={onCountChange}
                      />
                    )}
                </div>

                {/* Prompt compliance button */}
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                    complianceSuccess
                      ? "border-green-300 bg-green-50 text-green-600"
                      : isComplianceRunning
                        ? "border-blue-200 bg-blue-50 text-blue-600"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                  onClick={handlePromptCompliance}
                  disabled={isComplianceRunning || !prompt.trim()}
                  title="将提示词合规化"
                >
                  {isComplianceRunning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : complianceSuccess ? (
                    <Check className="size-3.5" />
                  ) : (
                    <ShieldCheck className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {complianceSuccess ? "已合规" : isComplianceRunning ? "合规中" : "合规"}
                  </span>
                </button>

                {/* Prompt optimization button */}
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                    optimizationSuccess
                      ? "border-green-300 bg-green-50 text-green-600"
                      : isOptimizationRunning
                        ? "border-blue-200 bg-blue-50 text-blue-600"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                  onClick={handlePromptOptimization}
                  disabled={isOptimizationRunning || !prompt.trim()}
                  title="优化当前提示词"
                >
                  {isOptimizationRunning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : optimizationSuccess ? (
                    <Check className="size-3.5" />
                  ) : (
                    <WandSparkles className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {optimizationSuccess ? "已优化" : isOptimizationRunning ? "优化中" : "优化"}
                  </span>
                </button>
              </div>

              {/* Right toolbar */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 sm:size-9"
                  aria-label="上传参考图"
                  title="上传参考图"
                >
                  <Plus className="size-5 sm:hidden" />
                  <ImagePlus className="hidden size-4 sm:block" />
                </button>

                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isDisabled}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 sm:size-9"
                  aria-label={submitLabel}
                  title={submitLabel}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </div>
            </div>
            {promptToolError ? (
              <p className="mt-2 px-1 text-xs font-medium leading-5 text-red-600">{promptToolError}</p>
            ) : null}

          </div>
      </div>
    </div>
  );
});

type ImageSettingsPopoverProps = Readonly<{
  aspectRatio: string;
  resolution: string;
  quality: string;
  count: number;
  resolutions: readonly { value: string; label: string; pixels: string }[];
  aspectRatioOptions: readonly { value: string; label: string }[];
  qualityOptions: readonly { value: string; label: string }[];
  priceLabel: string;
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onCountChange: (value: number) => void;
}>;

function ImageSettingsPopover({
  aspectRatio,
  resolution,
  quality,
  count,
  resolutions,
  aspectRatioOptions,
  qualityOptions,
  priceLabel,
  onAspectRatioChange,
  onResolutionChange,
  onQualityChange,
  onCountChange,
}: ImageSettingsPopoverProps) {
  return (
    <div
      className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-[80] max-h-[min(58dvh,28rem)] w-auto overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:left-auto sm:right-0 sm:w-[20rem] sm:max-h-[min(70dvh,34rem)]"
    >
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <h2 className="text-sm font-semibold text-gray-900">图片参数</h2>
        <span className="text-[11px] font-medium text-gray-400">{priceLabel ? `基础 ${priceLabel}/张` : "当前设置"}</span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <span className="text-sm font-semibold text-gray-700">张数</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
              onClick={() => onCountChange(Math.max(MIN_COUNT, count - 1))}
              disabled={count <= MIN_COUNT}
              aria-label="减少张数"
            >
              -
            </button>
            <span className="min-w-[2rem] text-center text-sm font-semibold text-gray-900">{count}</span>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
              onClick={() => onCountChange(Math.min(MAX_COUNT, count + 1))}
              disabled={count >= MAX_COUNT}
              aria-label="增加张数"
            >
              +
            </button>
          </div>
        </div>

        <SettingButtonGroup
          label="比例"
          options={aspectRatioOptions.map((o) => ({ value: o.value, label: o.label }))}
          activeValue={aspectRatio}
          onSelect={onAspectRatioChange}
        />

        {resolutions.length > 0 && (
          <SettingButtonGroup
            label="分辨率"
            options={resolutions.map((r) => ({ value: r.value, label: r.label }))}
            activeValue={resolution}
            onSelect={onResolutionChange}
          />
        )}

        <SettingButtonGroup
          label="质量"
          options={qualityOptions.map((o) => ({ value: o.value, label: o.label }))}
          activeValue={quality}
          onSelect={onQualityChange}
        />
      </div>
    </div>
  );
}

function SettingButtonGroup({
  label,
  options,
  activeValue,
  onSelect,
}: Readonly<{
  label: string;
  options: readonly { value: string; label: string }[];
  activeValue: string;
  onSelect: (value: string) => void;
}>) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-2.5">
      <div className="mb-2 text-xs font-semibold text-gray-500">{label}</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.value === activeValue;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center text-xs font-semibold leading-4 transition",
                active
                  ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-white hover:text-gray-900",
              )}
              onClick={() => onSelect(option.value)}
              aria-pressed={active}
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {active && <Check className="size-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

async function collectPromptRewrite(instruction: string, signal: AbortSignal): Promise<string> {
  let result = "";
  await streamPromptCrafter({
    messages: [{ role: "user", content: instruction }],
    signal,
    onChunk: (chunk) => {
      result += chunk;
    },
  });
  const trimmed = result.trim();
  if (!trimmed) {
    throw new Error("提示词优化结果为空");
  }
  return trimmed;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}
