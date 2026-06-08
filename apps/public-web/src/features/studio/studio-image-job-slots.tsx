"use client";

import { CircleStop, Clock3, Loader2, RotateCcw } from "lucide-react";

import {
  getImageJobItemDisplayStatus,
  getImageJobItemSummary,
  isCancellableImageJobItem,
  isRetryableImageJobItem,
} from "@/features/studio/studio-image-job-items";
import type { TurnProgress } from "@/features/studio/studio-turn-progress";
import type { StoredImageJobItem } from "@/features/studio/studio-types";
import { cn } from "@/lib/cn";

const ITEM_STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  retrying: "重试中",
  succeeded: "已完成",
  failed: "生成失败",
  cancelled: "已取消",
  generating: "生成中",
};

export function ImageJobItemSummaryBar({
  items,
  totalCount,
}: Readonly<{
  items: readonly StoredImageJobItem[];
  totalCount: number;
}>) {
  const summary = getImageJobItemSummary(items, totalCount);
  if (summary.length === 0) {
    return null;
  }
  return (
    <div className="mb-2 flex max-w-[560px] flex-wrap gap-1.5 text-[11px] font-medium">
      {summary.map((item) => (
        <span
          className={cn("rounded-full px-2 py-0.5 ring-1", getSummaryStatusClass(item.status))}
          key={item.status}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ImageJobItemPlaceholder({
  aspectPadding,
  fallbackStatus,
  index,
  item,
  progress,
  onCancel,
  onRetry,
}: Readonly<{
  aspectPadding: string;
  fallbackStatus: string;
  index: number;
  item?: StoredImageJobItem;
  progress: TurnProgress | undefined;
  onCancel: () => void;
  onRetry: () => void;
}>) {
  const status = item ? getImageJobItemDisplayStatus(item) : fallbackStatus;
  const failed = status === "failed";
  const cancelled = status === "cancelled";
  const canCancel = isCancellableImageJobItem(item);
  const canRetry = isRetryableImageJobItem(item);
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-2xl border", getSlotStatusClass(status))}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="relative w-full" style={{ paddingBottom: aspectPadding }}>
        {!failed && !cancelled && <div className="skeleton-shimmer absolute inset-0" />}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <SlotStatusIcon status={status} />
          <p className="text-xs font-medium text-gray-600">
            {getSlotStatusText(status, progress)}
          </p>
          {failed && item?.errorMessage && (
            <p className="line-clamp-2 text-[11px] leading-5 text-red-500">{item.errorMessage}</p>
          )}
        </div>
        {(canRetry || canCancel) && (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            {canRetry && (
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-sm transition hover:bg-red-50"
                onClick={onRetry}
                aria-label="重试单张图片"
                title="重试单张图片"
              >
                <RotateCcw className="size-3.5" />
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-amber-700 shadow-sm transition hover:bg-amber-50"
                onClick={onCancel}
                aria-label="取消单张图片"
                title="取消单张图片"
              >
                <CircleStop className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotStatusIcon({ status }: Readonly<{ status: string }>) {
  const iconClass = status === "failed" ? "text-red-500" : "text-blue-500";
  if (status === "queued" || status === "cancelled") {
    return <Clock3 className={cn("size-4", status === "cancelled" ? "text-amber-500" : "text-gray-400")} />;
  }
  if (status === "failed") {
    return <CircleStop className={cn("size-4", iconClass)} />;
  }
  return <Loader2 className={cn("size-4 animate-spin", iconClass)} />;
}

function getSlotStatusText(status: string, progress: TurnProgress | undefined) {
  if (progress?.message && (status === "running" || status === "generating")) {
    return progress.message;
  }
  return ITEM_STATUS_LABELS[status] ?? "生成中";
}

function getSlotStatusClass(status: string) {
  if (status === "failed") {
    return "border-red-200 bg-red-50";
  }
  if (status === "cancelled") {
    return "border-amber-200 bg-amber-50";
  }
  return "border-blue-100/80 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/40";
}

function getSummaryStatusClass(status: string) {
  if (status === "failed") {
    return "bg-red-50 text-red-600 ring-red-100";
  }
  if (status === "cancelled") {
    return "bg-amber-50 text-amber-700 ring-amber-100";
  }
  if (status === "succeeded") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }
  return "bg-blue-50 text-blue-600 ring-blue-100";
}
