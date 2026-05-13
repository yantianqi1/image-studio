"use client";

import { memo, useCallback } from "react";
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import { STUDIO_PRESETS, type StudioPreset } from "@/features/studio/studio-presets";

type StudioPromptMarketProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onApply: (preset: StudioPreset) => void;
}>;

export const StudioPromptMarket = memo(function StudioPromptMarket({
  open,
  onClose,
  onApply,
}: StudioPromptMarketProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 flex h-[min(85dvh,680px)] w-[min(92vw,48rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-gray-900">
                模板市场
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-sm text-gray-500">
                选择一组预设快速开始创作
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="inline-flex size-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
              <X className="size-4" />
              <span className="sr-only">关闭</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-width:thin]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {STUDIO_PRESETS.map((preset) => (
                <PresetCard key={preset.id} preset={preset} onApply={onApply} />
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});

const PresetCard = memo(function PresetCard({
  preset,
  onApply,
}: Readonly<{
  preset: StudioPreset;
  onApply: (preset: StudioPreset) => void;
}>) {
  const handleApply = useCallback(() => {
    onApply(preset);
  }, [onApply, preset]);

  return (
    <div className="group overflow-hidden rounded-xl border border-gray-100 bg-white transition hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md">
      <div className="flex flex-col gap-2.5 p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{preset.title}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">{preset.hint}</p>
        </div>
        <p className="line-clamp-3 text-[11px] leading-4 text-gray-400">{preset.prompt}</p>
        <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-400">
            <span className="rounded-full bg-gray-100 px-2 py-0.5">{preset.aspectRatio}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5">{preset.quality}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5">{preset.count} 张</span>
          </div>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-full bg-gray-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-gray-800"
            onClick={handleApply}
          >
            套用
          </button>
        </div>
      </div>
    </div>
  );
});
