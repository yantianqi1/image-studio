/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";
import type { ImageGalleryItem, ImageGalleryScope } from "@/lib/public-api";
import actionStyles from "./gallery-actions.module.css";
import styles from "./gallery-page.module.css";
import { GalleryTileActions } from "./gallery-tile-actions";
import { GalleryTileTags } from "./gallery-tags";

const DEFAULT_IMAGE_ASPECT_RATIO = 1.2;
const MIN_GALLERY_COLUMN_COUNT = 2;

const GALLERY_MASONRY_BREAKPOINTS = [
  { minWidth: 1180, columns: 4 },
  { minWidth: 820, columns: 4 },
  { minWidth: 540, columns: 3 },
] as const;

type ImageAspectRatios = Readonly<Record<number, number>>;
export function GalleryMasonry({
  items,
  scope,
  onPreview,
  onMutate,
}: Readonly<{
  items: readonly ImageGalleryItem[];
  scope: ImageGalleryScope;
  onPreview: (image: ImagePreviewDialogImage) => void;
  onMutate: () => void;
}>) {
  const [imageAspectRatios, setImageAspectRatios] = useState<ImageAspectRatios>({});
  const pendingAspectRatiosRef = useRef<Record<number, number>>({});
  const scheduledAspectRatioFrameRef = useRef<number | null>(null);
  const columns = useMeasuredGalleryColumns(items, imageAspectRatios);
  const flushPendingAspectRatios = useCallback(() => {
    scheduledAspectRatioFrameRef.current = null;
    const pendingAspectRatios = pendingAspectRatiosRef.current;
    pendingAspectRatiosRef.current = {};
    setImageAspectRatios((current) => mergeImageAspectRatios(current, pendingAspectRatios));
  }, []);
  const queueImageAspectRatio = useCallback((assetId: number, width: number, height: number) => {
    const aspectRatio = getSafeAspectRatio(width, height);
    pendingAspectRatiosRef.current = { ...pendingAspectRatiosRef.current, [assetId]: aspectRatio };
    if (scheduledAspectRatioFrameRef.current !== null) {
      return;
    }
    scheduledAspectRatioFrameRef.current = window.requestAnimationFrame(flushPendingAspectRatios);
  }, [flushPendingAspectRatios]);

  useEffect(() => () => {
    if (scheduledAspectRatioFrameRef.current !== null) {
      window.cancelAnimationFrame(scheduledAspectRatioFrameRef.current);
    }
  }, []);

  return (
    <div className={styles.galleryGrid} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className={styles.column}>
          {column.map((item, itemIndex) => (
            <GalleryTile
              key={`${item.job_id}-${item.result_index}-${item.asset_id}`}
              index={columnIndex + itemIndex * columns.length}
              item={item}
              scope={scope}
              onImageMeasure={queueImageAspectRatio}
              onPreview={onPreview}
              onMutate={onMutate}
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

function mergeImageAspectRatios(current: ImageAspectRatios, pending: ImageAspectRatios) {
  const entries = Object.entries(pending);
  if (entries.length === 0) {
    return current;
  }
  let hasChanged = false;
  const next = { ...current };
  entries.forEach(([assetId, aspectRatio]) => {
    const normalizedAssetId = Number(assetId);
    if (current[normalizedAssetId] === aspectRatio) {
      return;
    }
    next[normalizedAssetId] = aspectRatio;
    hasChanged = true;
  });
  return hasChanged ? next : current;
}

function getSafeAspectRatio(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return DEFAULT_IMAGE_ASPECT_RATIO;
  }
  return height / width;
}

function GalleryTile({
  index,
  item,
  scope,
  onImageMeasure,
  onPreview,
  onMutate,
}: Readonly<{
  index: number;
  item: ImageGalleryItem;
  scope: ImageGalleryScope;
  onImageMeasure: (assetId: number, width: number, height: number) => void;
  onPreview: (image: ImagePreviewDialogImage) => void;
  onMutate: () => void;
}>) {
  const title = getImageTitle(item);

  return (
    <article
      className={`${styles.tile} ${styles.tileAnimated} ${actionStyles.actionTile}`}
      style={{ animationDelay: `${Math.min(index * 40, 600)}ms` }}
    >
      <button
        className={styles.imageButton}
        type="button"
        onClick={() => onPreview({ src: item.asset_url, alt: title })}
      >
        <img
          src={item.thumbnail_url}
          alt={title}
          loading="lazy"
          decoding="async"
          className={styles.tileImage}
          sizes="(min-width: 1180px) 25vw, (min-width: 820px) 25vw, (min-width: 540px) 33vw, 50vw"
          onLoad={(event) => {
            event.currentTarget.classList.add(styles.tileImageLoaded);
            onImageMeasure(
              item.asset_id,
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            );
          }}
        />
      </button>
      <GalleryTileActions item={item} scope={scope} onMutate={onMutate} />
      <div className={styles.tileOverlay}>
        <div className={styles.tileMetaRow}>
          <span className={styles.visibilityPill}>{getVisibilityLabel(item)}</span>
        </div>
        <GalleryTileTags tags={item.tags} status={item.tagging_status} />
        <p className={styles.promptText}>{item.prompt}</p>
      </div>
    </article>
  );
}

function getImageTitle(item: ImageGalleryItem) {
  return item.prompt.trim() || `图片 ${item.asset_id}`;
}

function getVisibilityLabel(item: ImageGalleryItem) {
  return item.visibility === "public" ? "公开" : "私有";
}
