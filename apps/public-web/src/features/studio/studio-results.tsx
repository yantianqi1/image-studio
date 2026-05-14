"use client";

import { memo, useEffect, useRef } from "react";
import {
  CircleStop,
  Clock3,
  Download,
  Eye,
  Globe2,
  Loader2,
  Lock,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { TurnProgress } from "@/features/studio/studio-turn-progress";
import type { ImageAssetVisibility } from "@/lib/public-api";
import type { StudioConversation, StudioTurn, StoredImage } from "@/features/studio/studio-types";

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
  presetCards: readonly PresetCard[];
  onRetryTurn: (turnId: string) => void;
  onEditFromTurn: (turnId: string, image: StoredImage) => void;
  onCancelTurn: (turnId: string) => void;
  onImageVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
  onOpenLightbox: (images: readonly StoredImage[], startIndex: number) => void;
  onApplyPreset: (presetId: string) => void;
}>;

const MODE_LABELS: Record<string, { label: string; colorClass: string }> = {
  generate: { label: "生成", colorClass: "bg-blue-50 text-blue-600" },
  edit: { label: "编辑", colorClass: "bg-amber-50 text-amber-700" },
  chat: { label: "聊天", colorClass: "bg-emerald-50 text-emerald-700" },
};

function formatTurnTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatElapsed(ms: number | undefined) {
  if (!ms) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const StudioResults = memo(function StudioResults({
  conversation,
  progressByTurnKey,
  presetCards,
  onRetryTurn,
  onEditFromTurn,
  onCancelTurn,
  onImageVisibilityChange,
  onOpenLightbox,
  onApplyPreset,
}: StudioResultsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const turnCountRef = useRef(0);

  useEffect(() => {
    const turns = conversation?.turns ?? [];
    if (turns.length > turnCountRef.current) {
      viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
    }
    turnCountRef.current = turns.length;
  }, [conversation?.turns]);

  if (!conversation || conversation.turns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 scroll-smooth sm:p-6 [scrollbar-width:thin]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
          <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              <Sparkles className="size-4 text-blue-500" />
              生图预设
            </div>
            <h1 className="text-3xl font-medium leading-tight text-gray-900 sm:text-5xl">
              Turn ideas into images
            </h1>
            <p className="mx-auto mt-3 max-w-[460px] text-sm leading-6 text-gray-500 sm:text-[15px]">
              选择一组真实案例预设快速开始，也可以直接在下方输入自己的画面描述。
            </p>
          </div>
          {presetCards.length > 0 && (
            <div className="hide-scrollbar flex gap-3 overflow-x-auto px-1 pb-1 text-left sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
              {presetCards.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="group w-[250px] shrink-0 overflow-hidden rounded-[22px] border border-gray-100 bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_16px_-4px_rgba(36,36,36,0.08)] sm:w-auto"
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
                  <div className="flex flex-col gap-2 px-4 py-3.5">
                    <div className="text-sm font-semibold text-gray-900">{preset.title}</div>
                    <div className="line-clamp-2 text-sm leading-6 text-gray-500">{preset.hint}</div>
                    <div className="border-t border-gray-100 pt-2 text-xs font-medium text-blue-600">套用这个预设</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 scroll-smooth sm:p-6 [scrollbar-width:thin]" ref={viewportRef}>
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 sm:gap-6">
        {conversation.turns.map((turn) => (
          <TurnCard
            key={turn.id}
            turn={turn}
            conversationId={conversation.id}
            progress={progressByTurnKey.get(`${conversation.id}:${turn.id}`)}
            onRetry={() => onRetryTurn(turn.id)}
            onEditFromImage={(image) => onEditFromTurn(turn.id, image)}
            onCancel={() => onCancelTurn(turn.id)}
            onVisibilityChange={onImageVisibilityChange}
            onOpenLightbox={(startIndex) => onOpenLightbox(turn.images, startIndex)}
          />
        ))}
      </div>
    </div>
  );
});

const TurnCard = memo(function TurnCard({
  turn,
  conversationId,
  progress,
  onRetry,
  onEditFromImage,
  onCancel,
  onVisibilityChange,
  onOpenLightbox,
}: Readonly<{
  turn: StudioTurn;
  conversationId: string;
  progress: TurnProgress | undefined;
  onRetry: () => void;
  onEditFromImage: (image: StoredImage) => void;
  onCancel: () => void;
  onVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
  onOpenLightbox: (startIndex: number) => void;
}>) {
  const modeInfo = MODE_LABELS[turn.mode] ?? MODE_LABELS.generate;
  const isBusy = turn.status === "queued" || turn.status === "generating";

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
            </div>
          </div>
          <div className="whitespace-pre-wrap break-words">{turn.prompt}</div>

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
          {/* Chat response */}
          {turn.mode === "chat" && turn.images.length > 0 && turn.images[0]?.revisedPrompt && (
            <div className="mb-3 max-w-[min(94%,760px)] rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 shadow-sm">
              <div className="whitespace-pre-wrap break-words">{turn.images[0].revisedPrompt}</div>
            </div>
          )}

          {/* Image grid */}
          {turn.mode !== "chat" && turn.images.length > 0 && (
            <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
              {turn.images.map((image, index) => {
                const imageSrc = image.thumbnailUrl || image.url || "";
                if (!imageSrc && turn.status !== "queued" && turn.status !== "generating") return null;

                if (imageSrc) {
                  const visibility = image.visibility || "private";
                  return (
                    <figure
                      key={image.id}
                      className="group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-2xl bg-gray-100 shadow-[0_0_15px_rgba(44,30,116,0.12)] sm:mb-4"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenLightbox(index)}
                        className="block w-full cursor-pointer overflow-hidden text-left"
                        aria-label="查看大图"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageSrc}
                          alt={`Generated result ${index + 1}`}
                          className="block h-auto w-full transition duration-200 group-hover:brightness-95"
                        />
                      </button>

                      {/* Hover overlay actions */}
                      <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
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
                        {image.url && (
                          <button
                            type="button"
                            onClick={() => downloadImage(image.url!, turn.prompt)}
                            className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-sm transition hover:bg-white"
                            aria-label="下载"
                            title="下载"
                          >
                            <Download className="size-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Visibility badge */}
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
                              "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium opacity-0 shadow-sm transition group-hover:opacity-100",
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
                    </figure>
                  );
                }

                return null;
              })}
            </div>
          )}

          {/* Loading state */}
          {isBusy && (
            <div className="mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 sm:mb-4">
              <div className="flex flex-col items-center justify-center gap-2.5 px-5 py-6 text-center text-gray-500">
                <div className="rounded-full bg-white p-3 shadow-sm">
                  {turn.status === "queued" && !progress ? (
                    <Clock3 className="size-5 text-gray-400" />
                  ) : (
                    <Loader2 className="size-5 animate-spin text-blue-500" />
                  )}
                </div>
                <p className="text-sm font-medium text-gray-700">
                  {progress?.message || (turn.status === "queued" ? "准备中..." : "生成中...")}
                </p>
                {progress?.elapsedMs != null && (
                  <p className="rounded-full bg-white/70 px-2.5 py-1 font-mono text-xs tabular-nums text-gray-400">
                    已等待 {formatElapsed(progress.elapsedMs)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {turn.status === "error" && (
            <div className="mb-3 inline-flex h-[140px] w-full break-inside-avoid flex-col overflow-hidden rounded-2xl border border-red-200 bg-red-50 sm:mb-4">
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3 text-center text-sm leading-6 text-red-600">
                {turn.error || "生成失败"}
              </div>
              <div className="flex justify-end border-t border-red-100 bg-white/70 px-3 py-2">
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  onClick={onRetry}
                >
                  <RotateCcw className="size-3" />
                  重试
                </button>
              </div>
            </div>
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

function downloadImage(url: string, prompt: string) {
  const name = prompt.slice(0, 20).replace(/[^\w一-鿿]/g, "_") || "image";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  a.click();
}
