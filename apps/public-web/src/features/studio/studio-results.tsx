"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Check,
  CircleStop,
  Download,
  Eye,
  Globe2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { getImageResultSlots } from "@/features/studio/studio-image-job-items";
import {
  ImageJobItemPlaceholder,
  ImageJobItemSummaryBar,
} from "@/features/studio/studio-image-job-slots";
import type { TurnProgress } from "@/features/studio/studio-turn-progress";
import type { ImageAssetVisibility } from "@/lib/public-api";
import type { StudioConversation, StudioTurn, StoredImage } from "@/features/studio/studio-types";
import {
  capturePinnedResultsViewportSnapshot,
  captureResultsViewportSnapshot,
  shouldScrollResultsToBottom,
  type ResultsViewportSnapshot,
} from "@/features/studio/studio-results-scroll";

type PresetCard = Readonly<{
  id: string;
  title: string;
  hint: string;
  preview: string;
  aspectRatio: string;
  count: number;
}>;

type StudioResultsProps = Readonly<{
  conversation: StudioConversation | null;
  progressByTurnKey: ReadonlyMap<string, TurnProgress>;
  bottomInset: number;
  presetCards: readonly PresetCard[];
  isRefreshingPresets: boolean;
  onRetryTurn: (turnId: string) => void;
  onComplianceRetryTurn: (turnId: string) => void;
  onEditPromptRetry: (turnId: string, prompt: string) => void;
  onEditFromTurn: (turnId: string, image: StoredImage) => void;
  onCancelTurn: (turnId: string) => void;
  onRetryImageItem: (turnId: string, itemId: number) => void;
  onCancelImageItem: (turnId: string, itemId: number) => void;
  onDeleteTurn: (turnId: string) => void;
  onImageVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
  onOpenLightbox: (images: readonly StoredImage[], startIndex: number) => void;
  onApplyPreset: (presetId: string) => void;
  onRefreshPresets: () => void;
}>;

const MODE_LABELS: Record<string, { label: string; colorClass: string }> = {
  generate: { label: "生图", colorClass: "bg-blue-50 text-blue-600" },
  edit: { label: "生图", colorClass: "bg-blue-50 text-blue-600" },
};
const FIXED_COMPOSER_CLEARANCE = 16;
const PRESET_SKELETON_COUNT = 4;

function formatTurnTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const StudioResults = memo(function StudioResults({
  conversation,
  progressByTurnKey,
  bottomInset,
  presetCards,
  isRefreshingPresets,
  onRetryTurn,
  onComplianceRetryTurn,
  onEditPromptRetry,
  onEditFromTurn,
  onCancelTurn,
  onRetryImageItem,
  onCancelImageItem,
  onDeleteTurn,
  onImageVisibilityChange,
  onOpenLightbox,
  onApplyPreset,
  onRefreshPresets,
}: StudioResultsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousLayoutKeyRef = useRef("");
  const previousTurnCountRef = useRef(0);
  const previousViewportRef = useRef<ResultsViewportSnapshot | null>(null);
  const viewportStyle = getResultsViewportStyle(bottomInset);

  useEffect(() => {
    const turns = conversation?.turns ?? [];
    const conversationId = conversation?.id ?? null;
    const changedConversation = conversationId !== previousConversationIdRef.current;
    const previousTurnCount = changedConversation ? 0 : previousTurnCountRef.current;
    const previousLayoutKey = changedConversation ? "" : previousLayoutKeyRef.current;
    const previousViewport = changedConversation ? null : previousViewportRef.current;
    const layoutKey = getResultsLayoutKey(conversation, bottomInset);
    const viewport = viewportRef.current;
    const shouldScroll = shouldScrollResultsToBottom({
      hasLayoutChanged: layoutKey !== previousLayoutKey,
      hasNewTurn: turns.length > previousTurnCount,
      previousViewport,
    });

    if (viewport && shouldScroll) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: turns.length > previousTurnCount ? "smooth" : "auto" });
      previousViewportRef.current = capturePinnedResultsViewportSnapshot(viewport);
    } else {
      previousViewportRef.current = viewport ? captureResultsViewportSnapshot(viewport) : null;
    }
    previousConversationIdRef.current = conversationId;
    previousLayoutKeyRef.current = layoutKey;
    previousTurnCountRef.current = turns.length;
  }, [bottomInset, conversation]);

  if (!conversation || conversation.turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-start overflow-y-auto p-4 pb-44 scroll-smooth sm:items-center sm:justify-center sm:p-6 sm:pb-6 [scrollbar-width:thin]" style={viewportStyle}>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 sm:gap-5">
          <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              <Sparkles className="size-4 text-blue-500" />
              生图预设
            </div>
            <h1 className="hidden text-3xl font-medium leading-tight text-gray-900 sm:block sm:text-5xl">
              Turn ideas into images
            </h1>
            <p className="mx-auto mt-3 hidden max-w-[460px] text-sm leading-6 text-gray-500 sm:block sm:text-[15px]">
              选择一组真实案例预设快速开始，也可以直接在下方输入自己的画面描述。
            </p>
          </div>
          {presetCards.length > 0 ? (
            <div className="relative">
              <div className="mb-2 flex justify-end px-1">
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-gray-700 disabled:opacity-50"
                  onClick={onRefreshPresets}
                  disabled={isRefreshingPresets}
                  aria-label="刷新预设"
                  title="刷新预设"
                >
                  <RefreshCw className={cn("size-3.5", isRefreshingPresets && "animate-spin")} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 px-1 text-left lg:grid-cols-4">
                {presetCards.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="group w-full overflow-hidden rounded-[18px] border border-gray-100 bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_16px_-4px_rgba(36,36,36,0.08)] sm:rounded-[22px]"
                    onClick={() => onApplyPreset(preset.id)}
                    aria-label={`套用预设：${preset.title}`}
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preset.preview}
                        alt={preset.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pt-8 pb-2">
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-900 shadow-sm">
                          {preset.aspectRatio || "Auto"}
                        </span>
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur">
                          {preset.count} 张
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3.5">
                      <div className="line-clamp-2 text-xs font-semibold leading-5 text-gray-900 sm:text-sm">{preset.title}</div>
                      <div className="hidden line-clamp-2 text-sm leading-6 text-gray-500 sm:block">{preset.hint}</div>
                      <div className="border-t border-gray-100 pt-1 text-[11px] font-medium text-blue-600 sm:pt-2 sm:text-xs">套用预设</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <PresetSkeletonGrid />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-44 scroll-smooth sm:p-6 sm:pb-6 [scrollbar-width:thin]" ref={viewportRef} style={viewportStyle}>
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 sm:gap-6">
        {conversation.turns.map((turn) => (
          <TurnCard
            key={turn.id}
            turn={turn}
            progress={progressByTurnKey.get(`${conversation.id}:${turn.id}`)}
            onRetry={() => onRetryTurn(turn.id)}
            onComplianceRetry={() => onComplianceRetryTurn(turn.id)}
            onEditPromptRetry={(prompt) => onEditPromptRetry(turn.id, prompt)}
            onEditFromImage={(image) => onEditFromTurn(turn.id, image)}
            onCancel={() => onCancelTurn(turn.id)}
            onRetryImageItem={(itemId) => onRetryImageItem(turn.id, itemId)}
            onCancelImageItem={(itemId) => onCancelImageItem(turn.id, itemId)}
            onDelete={() => onDeleteTurn(turn.id)}
            onVisibilityChange={onImageVisibilityChange}
            onOpenLightbox={(startIndex) => onOpenLightbox(turn.images, startIndex)}
          />
        ))}
      </div>
    </div>
  );
});

function getResultsViewportStyle(bottomInset: number): CSSProperties | undefined {
  if (bottomInset <= 0) return undefined;
  const reservedSpace = bottomInset + FIXED_COMPOSER_CLEARANCE;
  return { paddingBottom: reservedSpace, scrollPaddingBottom: reservedSpace };
}

function getResultsLayoutKey(conversation: StudioConversation | null, bottomInset: number) {
  const turns = conversation?.turns ?? [];
  const latestTurn = turns.at(-1);
  if (!latestTurn) return `${conversation?.id ?? "none"}:${bottomInset}:empty`;
  return [
    conversation?.id ?? "none",
    turns.length,
    latestTurn.id,
    latestTurn.prompt,
    latestTurn.status,
    latestTurn.error ?? "",
    latestTurn.images.length,
    latestTurn.referenceImages.length,
    latestTurn.count,
    latestTurn.aspectRatio,
    latestTurn.resolution,
    latestTurn.quality,
    bottomInset,
  ].join("|");
}

function PresetSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 px-1 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: PRESET_SKELETON_COUNT }).map((_, index) => (
        <div
          className="overflow-hidden rounded-[18px] border border-gray-100 bg-white"
          key={index}
        >
          <div className="relative aspect-[16/9] bg-gray-100">
            <div className="skeleton-shimmer absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200/60 to-gray-100" />
          </div>
          <div className="space-y-2 px-3 py-2.5">
            <div className="h-4 rounded-full bg-gray-100" />
            <div className="h-3 w-2/3 rounded-full bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

const TurnCard = memo(function TurnCard({
  turn,
  progress,
  onRetry,
  onComplianceRetry,
  onEditPromptRetry,
  onEditFromImage,
  onCancel,
  onRetryImageItem,
  onCancelImageItem,
  onDelete,
  onVisibilityChange,
  onOpenLightbox,
}: Readonly<{
  turn: StudioTurn;
  progress: TurnProgress | undefined;
  onRetry: () => void;
  onComplianceRetry: () => void;
  onEditPromptRetry: (prompt: string) => void;
  onEditFromImage: (image: StoredImage) => void;
  onCancel: () => void;
  onRetryImageItem: (itemId: number) => void;
  onCancelImageItem: (itemId: number) => void;
  onDelete: () => void;
  onVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
  onOpenLightbox: (startIndex: number) => void;
}>) {
  const modeInfo = MODE_LABELS[turn.mode] ?? MODE_LABELS.generate;
  const isBusy = turn.status === "queued" || turn.status === "generating";
  const isComplianceRetrying = turn.status === "error" && progress !== undefined;
  const resultSlots = getImageResultSlots({
    count: turn.count,
    images: turn.images,
    imageJobItems: turn.imageJobItems,
  });
  const hasResultSlots = turn.images.length > 0 || isBusy || (turn.imageJobItems?.length ?? 0) > 0;
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");

  const submitPromptEdit = useCallback(() => {
    const nextPrompt = promptDraft.trim();
    if (!nextPrompt || isBusy) return;
    setEditingPrompt(false);
    setPromptDraft("");
    onEditPromptRetry(nextPrompt);
  }, [isBusy, onEditPromptRetry, promptDraft]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Prompt bubble (right-aligned) */}
      <div className="flex justify-end">
        <article className="w-full max-w-[min(94%,760px)] rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left text-sm leading-6 text-gray-900 shadow-sm sm:px-5 sm:py-4">
          {/* Header badges */}
          <div className="mb-2.5 flex items-start justify-between gap-3 border-b border-gray-100 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-5 text-gray-500">
              <span className={cn("rounded-full px-2 py-0.5 font-medium", modeInfo.colorClass)}>
                {modeInfo.label}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{turn.model}</span>
              <span className="px-1 text-gray-400">{formatTurnTime(turn.createdAt)}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                {formatTurnParameters(turn)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isBusy ? (
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                  onClick={onCancel}
                  aria-label="终止"
                  title="终止"
                >
                  <CircleStop className="size-3.5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                    onClick={onRetry}
                    disabled={isBusy || !turn.prompt.trim()}
                    aria-label="重新生成"
                    title="重新生成"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </>
              )}
              {!isBusy && (
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => {
                    setPromptDraft(turn.prompt);
                    setEditingPrompt(true);
                  }}
                  aria-label="修改提示词"
                  title="修改提示词"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                onClick={onDelete}
                aria-label="删除记录"
                title="删除记录"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
          {editingPrompt ? (
            <PromptEditForm
              value={promptDraft}
              onCancel={() => {
                setPromptDraft("");
                setEditingPrompt(false);
              }}
              onChange={setPromptDraft}
              onSubmit={submitPromptEdit}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words">{turn.prompt}</div>
          )}

          {/* Reference images */}
          {turn.referenceImages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {turn.referenceImages.map((img, index) => (
                <div
                  key={`${turn.id}-ref-${index}`}
                  className="size-16 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 sm:size-20"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl || img.assetUrl || img.thumbnailUrl || ""}
                    alt={img.name || `参考图 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      {/* Results section (left-aligned) */}
      <div className="flex justify-start">
        <section className="w-full px-1">
          {/* Image grid + loading skeletons */}
          {hasResultSlots && (
            <>
              <ImageJobItemSummaryBar items={turn.imageJobItems ?? []} totalCount={turn.count} />
              <div className={cn(
                "grid gap-3 sm:gap-4",
                turn.count <= 1 ? "grid-cols-1 max-w-[240px] sm:max-w-[360px]" : "grid-cols-2 max-w-[560px]",
              )}>
                {resultSlots.map((slot, index) => {
                  const imageIndex = slot.image ? turn.images.findIndex((image) => image.id === slot.image?.id) : -1;
                  return slot.image ? (
                    <ImageCell
                      key={slot.key}
                      image={slot.image}
                      index={imageIndex >= 0 ? imageIndex : index}
                      turn={turn}
                      onOpenLightbox={onOpenLightbox}
                      onEditFromImage={onEditFromImage}
                      onVisibilityChange={onVisibilityChange}
                    />
                  ) : (
                    <ImageJobItemPlaceholder
                      key={slot.key}
                      aspectPadding={getAspectPadding(turn.aspectRatio, turn.resolution)}
                      fallbackStatus={turn.status}
                      index={index}
                      item={slot.item}
                      progress={index === 0 ? progress : undefined}
                      onCancel={() => {
                        if (slot.item) onCancelImageItem(slot.item.id);
                      }}
                      onRetry={() => {
                        if (slot.item) onRetryImageItem(slot.item.id);
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Error state */}
          {turn.status === "error" && (
            <TurnErrorState
              error={turn.error}
              isComplianceRetrying={isComplianceRetrying}
              progress={progress}
              onComplianceRetry={onComplianceRetry}
              onRetry={onRetry}
            />
          )}

          {/* Cancelled state */}
          {turn.status === "cancelled" && (
            <div className="mb-3 inline-block h-[100px] w-full break-inside-avoid overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 sm:mb-4">
              <div className="flex h-full items-center justify-center px-4 py-4 text-center text-sm text-amber-700">
                任务已终止
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
});

function PromptEditForm({
  value,
  onCancel,
  onChange,
  onSubmit,
}: Readonly<{
  value: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}>) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
          onClick={onCancel}
          aria-label="取消修改"
          title="取消"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
          onClick={onSubmit}
          disabled={!value.trim()}
          aria-label="保存并重新生成"
          title="保存并重新生成"
        >
          <Check className="size-4" />
        </button>
      </div>
    </div>
  );
}

function TurnErrorState({
  error,
  isComplianceRetrying,
  progress,
  onComplianceRetry,
  onRetry,
}: Readonly<{
  error: string | undefined;
  isComplianceRetrying: boolean;
  progress: TurnProgress | undefined;
  onComplianceRetry: () => void;
  onRetry: () => void;
}>) {
  const statusMessage = progress?.message || "正在合规化改写...";

  return (
    <div
      className={cn(
        "mb-3 inline-flex h-[140px] w-full break-inside-avoid flex-col overflow-hidden rounded-2xl border sm:mb-4",
        isComplianceRetrying ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50",
      )}
      aria-busy={isComplianceRetrying}
    >
      <TurnErrorMessage
        error={error}
        isComplianceRetrying={isComplianceRetrying}
        statusMessage={statusMessage}
      />
      <TurnErrorActions
        isComplianceRetrying={isComplianceRetrying}
        onComplianceRetry={onComplianceRetry}
        onRetry={onRetry}
      />
    </div>
  );
}

function TurnErrorMessage({
  error,
  isComplianceRetrying,
  statusMessage,
}: Readonly<{
  error: string | undefined;
  isComplianceRetrying: boolean;
  statusMessage: string;
}>) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3 text-center text-sm leading-6">
      {isComplianceRetrying ? (
        <div className="flex flex-col items-center gap-2 text-blue-600">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-blue-100">
            <Loader2 className="size-4 animate-spin" />
          </span>
          <span className="font-medium">{statusMessage}</span>
          <span className="text-xs text-blue-500">改写完成后会自动重新提交生成</span>
        </div>
      ) : (
        <span className="text-red-600">{error || "生成失败"}</span>
      )}
    </div>
  );
}

function TurnErrorActions({
  isComplianceRetrying,
  onComplianceRetry,
  onRetry,
}: Readonly<{
  isComplianceRetrying: boolean;
  onComplianceRetry: () => void;
  onRetry: () => void;
}>) {
  return (
    <div className={cn(
      "flex justify-end gap-2 border-t bg-white/70 px-3 py-2",
      isComplianceRetrying ? "border-blue-100" : "border-red-100",
    )}>
      <button
        type="button"
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-70",
          isComplianceRetrying
            ? "border-blue-200 bg-blue-50 text-blue-600"
            : "border-blue-200 bg-white text-blue-600 hover:bg-blue-50",
        )}
        onClick={onComplianceRetry}
        disabled={isComplianceRetrying}
      >
        {isComplianceRetrying ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
        {isComplianceRetrying ? "合规化中" : "合规化重试"}
      </button>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onRetry}
        disabled={isComplianceRetrying}
      >
        <RotateCcw className="size-3" />
        重试
      </button>
    </div>
  );
}

function ImageCell({
  image,
  index,
  turn,
  onOpenLightbox,
  onEditFromImage,
  onVisibilityChange,
}: Readonly<{
  image: StoredImage;
  index: number;
  turn: StudioTurn;
  onOpenLightbox: (startIndex: number) => void;
  onEditFromImage: (image: StoredImage) => void;
  onVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
}>) {
  const imageSrc = image.thumbnailUrl || image.url || "";
  const [loaded, setLoaded] = useState(false);
  const onLoad = useCallback(() => setLoaded(true), []);

  if (!imageSrc && turn.status !== "queued" && turn.status !== "generating") return null;
  if (!imageSrc) return null;

  const visibility = image.visibility || "private";
  const aspectPadding = getAspectPadding(turn.aspectRatio, turn.resolution);

  return (
    <figure
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl bg-gray-100 shadow-[0_0_15px_rgba(44,30,116,0.12)]",
        "animate-in",
      )}
      style={{ animationDelay: `${index * 120}ms`, animationFillMode: "both" }}
    >
      <div className="relative w-full" style={{ paddingBottom: aspectPadding }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={`Generated result ${index + 1}`}
          onLoad={onLoad}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:brightness-95",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
        {!loaded && (
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <div className="skeleton-shimmer absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200/60 to-gray-100" />
          </div>
        )}
      </div>

      {loaded && (
        <>
          <button
            type="button"
            onClick={() => onOpenLightbox(index)}
            className="absolute inset-0 cursor-pointer"
            aria-label="查看大图"
          />
          <div className="pointer-events-auto absolute top-2 right-2 z-10 flex items-center gap-1 opacity-100 transition duration-150 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onOpenLightbox(index)}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2 text-[11px] font-medium text-gray-800 shadow-sm transition hover:bg-white"
              aria-label="查看原图"
              title="查看原图"
            >
              <Eye className="size-3" />
              查看
            </button>
            <button
              type="button"
              onClick={() => onEditFromImage(image)}
              className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-sm transition hover:bg-white"
              aria-label="加入编辑"
              title="加入编辑"
            >
              <Plus className="size-3.5" />
            </button>
            {image.assetId != null && (
              <a
                href={buildAssetDownloadUrl(image.assetId)}
                download={downloadFileName(turn.prompt, image.assetId)}
                className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-sm transition hover:bg-white"
                aria-label="下载"
                title="下载"
              >
                <Download className="size-3.5" />
              </a>
            )}
          </div>
          <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1">
            {image.assetId != null && (
              <button
                type="button"
                onClick={() =>
                  onVisibilityChange(
                    image.assetId!,
                    visibility === "public" ? "private" : "public",
                  )
                }
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium opacity-100 shadow-sm transition sm:opacity-0 sm:group-hover:opacity-100",
                  visibility === "public"
                    ? "bg-white/95 text-blue-600 hover:bg-blue-50"
                    : "bg-white/95 text-gray-700 hover:bg-gray-100",
                )}
                aria-label={visibility === "public" ? "取消公开" : "公开"}
                title={visibility === "public" ? "取消公开" : "公开"}
              >
                {visibility === "public" ? <Lock className="size-3" /> : <Globe2 className="size-3" />}
                {visibility === "public" ? "取消公开" : "公开"}
              </button>
            )}
            <div
              className={cn(
                "pointer-events-none inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium shadow-sm backdrop-blur-sm",
                visibility === "public"
                  ? "bg-blue-50/90 text-blue-600 ring-1 ring-blue-200"
                  : "bg-gray-900/70 text-white ring-1 ring-white/20",
              )}
            >
              {visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
              {visibility === "public" ? "公开" : "私密"}
            </div>
          </div>
        </>
      )}
    </figure>
  );
}

function formatTurnParameters(turn: StudioTurn): string {
  return [
    turn.resolution || "auto",
    turn.aspectRatio,
    QUALITY_LABELS[turn.quality] ?? turn.quality,
  ].filter(Boolean).join(" / ");
}

const QUALITY_LABELS: Record<string, string> = {
  low: "低质量",
  medium: "中质量",
  high: "高质量",
};

function getAspectPadding(aspectRatio: string, resolution: string): string {
  const ratioMap: Record<string, number> = {
    "1:1": 1,
    "3:2": 2 / 3,
    "16:9": 9 / 16,
    "21:9": 9 / 21,
    "9:16": 16 / 9,
    "4:3": 3 / 4,
    "3:4": 4 / 3,
  };

  if (resolution && resolution !== "auto") {
    const parts = resolution.split("x");
    if (parts.length === 2) {
      const w = Number(parts[0]);
      const h = Number(parts[1]);
      if (w > 0 && h > 0) {
        const resolvedRatio = h / w;
        const expectedRatio = ratioMap[aspectRatio];
        if (!expectedRatio || Math.abs(resolvedRatio - expectedRatio) < 0.1) {
          return `${resolvedRatio * 100}%`;
        }
      }
    }
  }

  const ratio = ratioMap[aspectRatio];
  return ratio ? `${ratio * 100}%` : "100%";
}

function buildAssetDownloadUrl(assetId: number): string {
  return `/api/public/image/assets/${assetId}/download`;
}

function downloadFileName(prompt: string, assetId: number): string {
  const name = prompt.slice(0, 20).replace(/[^\w一-鿿]/g, "_");
  return name || `generated-image-${assetId}`;
}
