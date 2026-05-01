/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo } from "react";

import type { ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";
import { formatDateTime } from "@/lib/formatters";
import type { ImageGalleryItem } from "@/lib/public-api";
import styles from "./gallery-page.module.css";

const GALLERY_COLUMN_COUNT = 4;

export function GalleryMasonry({
  items,
  onPreview,
}: Readonly<{
  items: readonly ImageGalleryItem[];
  onPreview: (image: ImagePreviewDialogImage) => void;
}>) {
  const columns = useOrderedGalleryColumns(items);

  return (
    <div className={styles.galleryGrid}>
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className={styles.column}>
          {column.map((item) => (
            <GalleryTile key={`${item.job_id}-${item.result_index}-${item.asset_id}`} item={item} onPreview={onPreview} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function useOrderedGalleryColumns(items: readonly ImageGalleryItem[]) {
  return useMemo(
    () => buildOrderedGalleryColumns(items, GALLERY_COLUMN_COUNT),
    [items],
  );
}

function buildOrderedGalleryColumns(items: readonly ImageGalleryItem[], columnCount: number) {
  const columns: ImageGalleryItem[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function GalleryTile({
  item,
  onPreview,
}: Readonly<{
  item: ImageGalleryItem;
  onPreview: (image: ImagePreviewDialogImage) => void;
}>) {
  const title = getImageTitle(item);

  return (
    <article className={styles.tile}>
      <button
        className={styles.imageButton}
        type="button"
        onClick={() => onPreview({ src: item.asset_url, alt: title })}
      >
        <img src={item.asset_url} alt={title} loading="lazy" />
      </button>
      <div className={styles.tileMeta}>
        <div className={styles.tileMetaRow}>
          <span className={styles.visibilityPill}>{getVisibilityLabel(item)}</span>
          <span>{formatDateTime(item.created_at)}</span>
        </div>
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
