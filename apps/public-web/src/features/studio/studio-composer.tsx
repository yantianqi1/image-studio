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
const PROMPT_AREA_DEFAULT_HEIGHT = 104;
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
  const modelMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="w-full shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
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
            className="min-h-[96px] w-full resize-none border-0 bg-transparent px-5 pt-5 pb-2 text-[15px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 sm:min-h-0 sm:px-5 sm:py-4 sm:text-[15px] sm:leading-6"
            style={{ height: promptAreaHeight }}
          />

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
                  <div className="relative shrink-0">
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const aspectRatioLabel = ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio)?.label ?? aspectRatio;
  const resolutionLabel = resolutions.find((r) => r.value === resolution)?.label ?? resolution;
  const qualityLabel = QUALITY_OPTIONS.find((o) => o.value === quality)?.label ?? quality;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-[calc(100%+8px)] left-0 z-[70] w-[min(calc(100vw-2rem),22rem)] rounded-[20px] border border-gray-200 bg-white p-2.5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
    >
      <div className="grid grid-cols-2 gap-2">
        {/* Count */}
        <div className="flex h-9 items-center justify-between gap-1.5 rounded-full border border-gray-200 bg-white px-2.5">
          <span className="shrink-0 text-[11px] font-medium text-gray-500">张数</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
              onClick={() => onCountChange(Math.max(MIN_COUNT, count - 1))}
              disabled={count <= MIN_COUNT}
            >
              -
            </button>
            <span className="min-w-[1.25rem] text-center text-xs font-semibold text-gray-900">{count}</span>
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
              onClick={() => onCountChange(Math.min(MAX_COUNT, count + 1))}
              disabled={count >= MAX_COUNT}
            >
              +
            </button>
          </div>
        </div>

        {/* Aspect Ratio */}
        <SettingDropdown
          label="比例"
          value={aspectRatioLabel}
          isOpen={openMenu === "ratio"}
          onToggle={() => setOpenMenu(openMenu === "ratio" ? null : "ratio")}
          options={ASPECT_RATIO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          activeValue={aspectRatio}
          onSelect={(v) => { onAspectRatioChange(v); setOpenMenu(null); }}
        />

        {/* Resolution */}
        {resolutions.length > 0 && (
          <SettingDropdown
            label="分辨率"
            value={resolutionLabel}
            isOpen={openMenu === "resolution"}
            onToggle={() => setOpenMenu(openMenu === "resolution" ? null : "resolution")}
            options={resolutions.map((r) => ({ value: r.value, label: r.label }))}
            activeValue={resolution}
            onSelect={(v) => { onResolutionChange(v); setOpenMenu(null); }}
          />
        )}

        {/* Quality */}
        <SettingDropdown
          label="质量"
          value={qualityLabel}
          isOpen={openMenu === "quality"}
          onToggle={() => setOpenMenu(openMenu === "quality" ? null : "quality")}
          options={QUALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          activeValue={quality}
          onSelect={(v) => { onQualityChange(v); setOpenMenu(null); }}
        />
      </div>
    </div>
  );
}

function SettingDropdown({
  label,
  value,
  isOpen,
  onToggle,
  options,
  activeValue,
  onSelect,
}: Readonly<{
  label: string;
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  options: readonly { value: string; label: string }[];
  activeValue: string;
  onSelect: (value: string) => void;
}>) {
  return (
    <div className="relative flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 text-[11px]">
      <span className="shrink-0 font-medium text-gray-500">{label}</span>
      <button
        type="button"
        className="flex h-7 min-w-0 flex-1 items-center justify-end gap-1 bg-transparent text-right text-xs font-semibold text-gray-900"
        onClick={onToggle}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-[90] max-h-[14rem] w-[min(17rem,calc(100vw-3rem))] overflow-y-auto rounded-[16px] border border-gray-200 bg-white p-1.5 shadow-[0_18px_46px_-26px_rgba(15,23,42,0.35)]">
          {options.map((option) => {
            const active = option.value === activeValue;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-100",
                  active && "bg-gray-100 font-medium text-gray-900",
                )}
                onClick={() => onSelect(option.value)}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {active && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
