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
import { streamPromptCrafter } from "@/features/prompt-crafter/prompt-crafter-api";
import { ASPECT_RATIO_OPTIONS, QUALITY_OPTIONS } from "@/features/studio/studio-options";
import {
  MAX_COUNT,
  MIN_COUNT,
  type ComposerMode,
  type StoredReferenceImage,
} from "@/features/studio/studio-types";
import type { PublicModelSummary } from "@/lib/public-api.types";
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
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  isSubmitting: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (model: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onResolutionChange: (resolution: string) => void;
  onQualityChange: (quality: string) => void;
  onCountChange: (count: number) => void;
  onReferenceImagesChange: (images: readonly StoredReferenceImage[]) => void;
  onSubmit: () => void;
  onOpenPromptMarket: () => void;
}>;

const MODE_OPTIONS: readonly { value: ComposerMode; label: string; icon: typeof MessageCircle }[] = [
  { value: "chat", label: "对话", icon: MessageCircle },
  { value: "generate", label: "生成", icon: Paintbrush },
  { value: "edit", label: "编辑", icon: ImagePlus },
];

const PROMPT_AREA_MIN_HEIGHT = 74;
const PROMPT_AREA_DEFAULT_HEIGHT = 80;
const PROMPT_AREA_MAX_HEIGHT = 320;

function getPromptAreaMaxHeight() {
  if (typeof window === "undefined") return PROMPT_AREA_MAX_HEIGHT;
  return Math.max(PROMPT_AREA_MIN_HEIGHT, Math.min(PROMPT_AREA_MAX_HEIGHT, Math.floor(window.innerHeight * 0.42)));
}

function clampPromptAreaHeight(height: number) {
  return Math.min(Math.max(height, PROMPT_AREA_MIN_HEIGHT), getPromptAreaMaxHeight());
}

function getSubmitLabel(mode: ComposerMode, isSubmitting: boolean, hasRefs: boolean) {
  if (isSubmitting) return "处理中";
  if (mode === "chat") return "发送";
  if (mode === "edit" || hasRefs) return "编辑图片";
  return "生成图片";
}

export const StudioComposer = memo(function StudioComposer(props: StudioComposerProps) {
  const {
    mode,
    prompt,
    model,
    aspectRatio,
    resolution,
    quality,
    count,
    referenceImages,
    modelsState,
    isSubmitting,
    onModeChange,
    onPromptChange,
    onModelChange,
    onAspectRatioChange,
    onResolutionChange,
    onQualityChange,
    onCountChange,
    onReferenceImagesChange,
    onSubmit,
    onOpenPromptMarket,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const complianceAbortRef = useRef<AbortController | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const settingsContainerRef = useRef<HTMLDivElement>(null);

  const activeRatio = ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio);
  const resolutions = activeRatio?.resolutions ?? [];
  const isDisabled = isSubmitting || !prompt.trim() || modelsState.status !== "ready";
  const submitLabel = getSubmitLabel(mode, isSubmitting, referenceImages.length > 0);

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
    const handleResize = () => setPromptAreaHeight((h) => clampPromptAreaHeight(h));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
      if (mode !== "edit") onModeChange("edit");
    },
    [mode, onModeChange, onReferenceImagesChange, referenceImages],
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
      if (mode !== "edit") onModeChange("edit");
      event.target.value = "";
    },
    [mode, onModeChange, onReferenceImagesChange, referenceImages],
  );

  const handleRemoveReference = useCallback(
    (index: number) => {
      const next = referenceImages.filter((_, i) => i !== index);
      onReferenceImagesChange(next);
      if (next.length === 0 && mode === "edit") onModeChange("generate");
    },
    [mode, onModeChange, onReferenceImagesChange, referenceImages],
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
    complianceAbortRef.current = new AbortController();

    const systemInstruction = `请将下面的图片生成提示词进行合规化改写。

核心目标：在不改变原始画面主题、人物气质、构图、服装、场景、光线、色彩、镜头语言和艺术风格的前提下，去除或弱化可能导致生图失败、审核不通过、内容过于露骨、年龄表达不清、或模型误判的部分，并输出一段完整、干净、自然、可直接用于图像生成模型的最终提示词。

改写要求：
保持原始画面的核心设定不变，不改变主体、场景、时代风格、服装类型、构图、人物姿态、背景道具、光影氛围和整体美学。保留重要视觉元素，例如发型、服饰、环境、材质、道具、镜头、景深、光线、色彩和细节表现。

如果原提示词中出现未成年、少女、幼态、学生、萝莉、child、teen、young girl 等可能暗示未成年或年龄模糊的词，请统一改写为明确成年人物，例如"成年女性""adult woman""woman in her 20s"。

如果原提示词中出现过度性化身体描写，例如 huge boobs、huge breast、cleavage、oiled skin、seductive、sexy、erotic、nude、revealing 等，请改写为合规的时尚摄影、服装轮廓、气质、材质和光影描述，例如 elegant neckline、refined silhouette、luminous skin、fashion editorial styling、romantic feminine styling。

删除或安全改写色情、裸露、性行为、挑逗性姿势、未成年性化、非自愿、暴力血腥、仇恨、违法、侵犯隐私、真实人物不当使用等不合规内容。

优化提示词结构，删除混乱、重复、无效或堆砌严重的词汇。使用清晰、具体、可视化的摄影语言和画面描述，让最终提示词自然连贯、画面明确、可执行性强。

最终只输出一段完整的纯提示词。不要输出标题、解释、修改说明、列表、引号、代码块或任何额外内容。

原始提示词如下：
${prompt}`;

    let result = "";
    try {
      await streamPromptCrafter({
        messages: [{ role: "user", content: systemInstruction }],
        onChunk: (chunk) => {
          result += chunk;
          onPromptChange(result);
        },
        signal: complianceAbortRef.current.signal,
      });
      setComplianceSuccess(true);
      setTimeout(() => setComplianceSuccess(false), 2000);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        onPromptChange(prompt);
      }
    } finally {
      setIsComplianceRunning(false);
      complianceAbortRef.current = null;
    }
  }, [prompt, isComplianceRunning, onPromptChange]);

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Reference images row */}
      {referenceImages.length > 0 && (
        <div className="mb-2 flex max-h-20 gap-2 overflow-x-auto px-1 py-1 sm:mb-3">
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
        className="overflow-visible rounded-[24px] border border-gray-200 bg-white/95 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:border-gray-100 sm:shadow-[0_24px_80px_-34px_rgba(15,23,42,0.3)]"
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
              mode === "chat"
                ? "输入消息与AI聊天..."
                : referenceImages.length > 0
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
              <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
                {/* Mode toggle */}
                <div className="inline-flex h-8 shrink-0 items-center rounded-full bg-gray-100 p-0.5 text-xs font-medium text-gray-600">
                  {MODE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 transition",
                          active
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700",
                        )}
                        onClick={() => onModeChange(option.value)}
                        aria-pressed={active}
                        title={option.label}
                      >
                        <Icon className="size-3.5" />
                        <span className="hidden sm:inline">{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Model selector */}
                <div ref={modelMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
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
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-100",
                              active && "bg-gray-100 font-medium text-gray-900",
                            )}
                            onClick={() => {
                              onModelChange(m.code);
                              setIsModelMenuOpen(false);
                            }}
                          >
                            <span className="truncate">{m.display_name}</span>
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

                {/* Settings toggle (image modes only) */}
                {mode !== "chat" && (
                  <div ref={settingsContainerRef} className="relative shrink-0">
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
                        onAspectRatioChange={onAspectRatioChange}
                        onResolutionChange={onResolutionChange}
                        onQualityChange={onQualityChange}
                        onCountChange={onCountChange}
                      />
                    )}
                  </div>
                )}

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
                  title="提示词合规化"
                >
                  {isComplianceRunning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : complianceSuccess ? (
                    <Check className="size-3.5" />
                  ) : (
                    <ShieldCheck className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {complianceSuccess ? "已合规" : isComplianceRunning ? "优化中" : "合规"}
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
  onAspectRatioChange,
  onResolutionChange,
  onQualityChange,
  onCountChange,
}: ImageSettingsPopoverProps) {
  return (
    <div
      className="absolute bottom-[calc(100%+8px)] right-0 z-[80] max-h-[min(70dvh,34rem)] w-[20rem] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <h2 className="text-sm font-semibold text-gray-900">图片参数</h2>
        <span className="text-[11px] font-medium text-gray-400">当前设置</span>
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
          options={ASPECT_RATIO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
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
          options={QUALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}
