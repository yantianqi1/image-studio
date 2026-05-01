/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";
import { formatDateTime } from "@/lib/formatters";
import type { ImageGalleryItem } from "@/lib/public-api";
import actionStyles from "./gallery-actions.module.css";
import styles from "./gallery-page.module.css";

const DEFAULT_IMAGE_ASPECT_RATIO = 1.2;
const MIN_GALLERY_COLUMN_COUNT = 1;
const COPY_FEEDBACK_VISIBLE_MS = 1600;

const GALLERY_MASONRY_BREAKPOINTS = [
  { minWidth: 1180, columns: 4 },
  { minWidth: 820, columns: 3 },
  { minWidth: 540, columns: 2 },
] as const;

type ImageAspectRatios = Readonly<Record<number, number>>;
type CopyStatus = "idle" | "success" | "error";

export function GalleryMasonry({
  items,
  onPreview,
}: Readonly<{
  items: readonly ImageGalleryItem[];
  onPreview: (image: ImagePreviewDialogImage) => void;
}>) {
  const [imageAspectRatios, setImageAspectRatios] = useState<ImageAspectRatios>({});
  const columns = useMeasuredGalleryColumns(items, imageAspectRatios);
  const updateImageAspectRatio = useCallback((assetId: number, width: number, height: number) => {
    const aspectRatio = getSafeAspectRatio(width, height);
    setImageAspectRatios((current) => {
      if (current[assetId] === aspectRatio) {
        return current;
      }
      return { ...current, [assetId]: aspectRatio };
    });
  }, []);

  return (
    <div className={styles.galleryGrid} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className={styles.column}>
          {column.map((item) => (
            <GalleryTile
              key={`${item.job_id}-${item.result_index}-${item.asset_id}`}
              item={item}
              onImageMeasure={updateImageAspectRatio}
              onPreview={onPreview}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function useMeasuredGalleryColumns(
  items: readonly ImageGalleryItem[],
  imageAspectRatios: ImageAspectRatios,
) {
  const columnCount = useGalleryColumnCount();
  return useMemo(
    () => buildMeasuredGalleryColumns(items, columnCount, imageAspectRatios),
    [columnCount, imageAspectRatios, items],
  );
}

function useGalleryColumnCount() {
  const [columnCount, setColumnCount] = useState(getGalleryColumnCount);

  useEffect(() => {
    const updateColumnCount = () => setColumnCount(getGalleryColumnCount());
    const mediaQueries = GALLERY_MASONRY_BREAKPOINTS.map(({ minWidth }) =>
      window.matchMedia(`(min-width: ${minWidth}px)`),
    );

    updateColumnCount();
    mediaQueries.forEach((query) => query.addEventListener("change", updateColumnCount));
    return () => mediaQueries.forEach((query) => query.removeEventListener("change", updateColumnCount));
  }, []);

  return columnCount;
}

function getGalleryColumnCount() {
  if (typeof window === "undefined") {
    return MIN_GALLERY_COLUMN_COUNT;
  }
  return GALLERY_MASONRY_BREAKPOINTS.find(({ minWidth }) =>
    window.matchMedia(`(min-width: ${minWidth}px)`).matches,
  )?.columns ?? MIN_GALLERY_COLUMN_COUNT;
}

function buildMeasuredGalleryColumns(
  items: readonly ImageGalleryItem[],
  columnCount: number,
  imageAspectRatios: ImageAspectRatios,
) {
  const columns: ImageGalleryItem[][] = Array.from({ length: columnCount }, () => []);
  const columnHeights = Array.from({ length: columnCount }, () => 0);

  items.forEach((item) => {
    const columnIndex = getShortestColumnIndex(columnHeights);
    columns[columnIndex].push(item);
    columnHeights[columnIndex] += getEstimatedImageHeight(item, imageAspectRatios);
  });
  return columns;
}

function getShortestColumnIndex(columnHeights: readonly number[]) {
  return columnHeights.reduce((targetIndex, height, index) =>
    height < columnHeights[targetIndex] ? index : targetIndex, 0);
}

function getEstimatedImageHeight(item: ImageGalleryItem, imageAspectRatios: ImageAspectRatios) {
  return imageAspectRatios[item.asset_id] ?? DEFAULT_IMAGE_ASPECT_RATIO;
}

function getSafeAspectRatio(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return DEFAULT_IMAGE_ASPECT_RATIO;
  }
  return height / width;
}

function GalleryTile({
  item,
  onImageMeasure,
  onPreview,
}: Readonly<{
  item: ImageGalleryItem;
  onImageMeasure: (assetId: number, width: number, height: number) => void;
  onPreview: (image: ImagePreviewDialogImage) => void;
}>) {
  const title = getImageTitle(item);

  return (
    <article className={`${styles.tile} ${actionStyles.actionTile}`}>
      <button
        className={styles.imageButton}
        type="button"
        onClick={() => onPreview({ src: item.asset_url, alt: title })}
      >
        <img
          src={item.asset_url}
          alt={title}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1180px) 25vw, (min-width: 820px) 33vw, (min-width: 540px) 50vw, 100vw"
          onLoad={(event) => {
            onImageMeasure(
              item.asset_id,
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            );
          }}
        />
      </button>
      <GalleryTileActions item={item} />
      <div className={styles.tileOverlay}>
        <div className={styles.tileMetaRow}>
          <span className={styles.visibilityPill}>{getVisibilityLabel(item)}</span>
          <span className={styles.timePill}>{formatDateTime(item.created_at)}</span>
        </div>
        <p className={styles.promptText}>{item.prompt}</p>
      </div>
    </article>
  );
}

function GalleryTileActions({ item }: Readonly<{ item: ImageGalleryItem }>) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setCopyStatus("idle"), COPY_FEEDBACK_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  async function handleCopyPrompt() {
    try {
      await copyPromptToClipboard(item.prompt);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className={actionStyles.actionBar} aria-label="图片操作">
      <button className={actionStyles.actionButton} type="button" onClick={() => void handleCopyPrompt()}>
        复制
      </button>
      <Link className={actionStyles.actionButton} href={buildReusePromptHref(item.prompt)}>
        复用
      </Link>
      <a className={actionStyles.actionButton} href={item.asset_url} download={buildDownloadName(item)}>
        下载
      </a>
      <CopyStatusNotice copyStatus={copyStatus} />
    </div>
  );
}

function CopyStatusNotice({ copyStatus }: Readonly<{ copyStatus: CopyStatus }>) {
  if (copyStatus === "idle") {
    return null;
  }
  return (
    <span className={copyStatus === "success" ? actionStyles.actionNotice : `${actionStyles.actionNotice} ${actionStyles.actionNoticeError}`}>
      {copyStatus === "success" ? "已复制" : "复制失败"}
    </span>
  );
}

async function copyPromptToClipboard(prompt: string) {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable.");
  }
  await navigator.clipboard.writeText(prompt);
}

function buildReusePromptHref(prompt: string) {
  return `/generate?prompt=${encodeURIComponent(prompt)}`;
}

function buildDownloadName(item: ImageGalleryItem) {
  return `image-studio-${item.asset_id}.png`;
}

function getImageTitle(item: ImageGalleryItem) {
  return item.prompt.trim() || `图片 ${item.asset_id}`;
}

function getVisibilityLabel(item: ImageGalleryItem) {
  return item.visibility === "public" ? "公开" : "私有";
}
