/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

import type { StoredImage } from "@/features/studio/studio-types";

type StudioLightboxProps = Readonly<{
  images: readonly StoredImage[];
  startIndex: number;
  onClose: () => void;
}>;

export function StudioLightbox({ images, startIndex, onClose }: StudioLightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [closing, setClosing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const image = images[index];
  const src = image?.url || image?.thumbnailUrl || "";
  const hasMultiple = images.length > 1;

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  const handleDownload = useCallback(async () => {
    if (!src || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `image-${index + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  }, [src, index, downloading]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowLeft" && hasMultiple) goPrev();
      else if (e.key === "ArrowRight" && hasMultiple) goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [handleClose, goPrev, goNext, hasMultiple]);

  if (!image) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm sm:p-6 ${closing ? "animate-[fade-out_150ms_ease_forwards]" : "animate-[fade-in_220ms_cubic-bezier(0.32,0.72,0,1)_forwards]"}`}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={handleClose}
    >
      {/* Close button */}
      <button
        type="button"
        className="fixed top-4 right-4 z-10 grid size-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        aria-label="关闭"
      >
        <X className="size-5" />
      </button>

      {/* Download button */}
      <button
        type="button"
        className="fixed top-4 right-18 z-10 grid size-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20 disabled:opacity-50"
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        disabled={downloading}
        aria-label="下载"
      >
        <Download className="size-5" />
      </button>

      {/* Prev/Next */}
      {hasMultiple && (
        <>
          <button
            type="button"
            className="fixed left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="上一张"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            className="fixed right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="下一张"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}

      {/* Image */}
      <figure
        className={`m-0 max-h-[90vh] max-w-[min(94vw,82rem)] ${closing ? "animate-[scale-out_150ms_ease_forwards]" : "animate-[scale-in_320ms_cubic-bezier(0.32,0.72,0,1)_40ms_forwards]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={`图片 ${index + 1}`}
          className="block max-h-[90vh] max-w-full rounded-lg bg-gray-900 object-contain shadow-2xl"
        />
      </figure>

      {/* Counter */}
      {hasMultiple && (
        <div className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white/80 backdrop-blur">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
