"use client";

import type { ImageGalleryItem, ImageTaggingStatus } from "@/lib/public-api";
import styles from "./gallery-tags.module.css";

const ACTIVE_TAG_LABEL = "全部";
const TAG_STATUS_LABELS: Partial<Record<ImageTaggingStatus, string>> = {
  pending: "打标中",
  queued: "打标中",
  running: "打标中",
  failed: "打标失败",
};

export function GalleryTagFilter({
  tags,
  selectedTag,
  onTagChange,
}: Readonly<{
  tags: readonly string[];
  selectedTag: string | null;
  onTagChange: (tag: string | null) => void;
}>) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <div className={styles.tagFilter} aria-label="图库标签筛选">
      <button
        className={!selectedTag ? `${styles.tagChip} ${styles.tagChipActive}` : styles.tagChip}
        type="button"
        onClick={() => onTagChange(null)}
      >
        {ACTIVE_TAG_LABEL}
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          className={selectedTag === tag ? `${styles.tagChip} ${styles.tagChipActive}` : styles.tagChip}
          type="button"
          onClick={() => onTagChange(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

export function GalleryTileTags({
  tags,
  status,
}: Readonly<{
  tags: readonly string[];
  status: ImageTaggingStatus;
}>) {
  if (tags.length > 0) {
    return (
      <div className={styles.tileTags}>
        {tags.map((tag) => (
          <span key={tag} className={styles.tileTag}>
            {tag}
          </span>
        ))}
      </div>
    );
  }
  const statusLabel = TAG_STATUS_LABELS[status];
  if (!statusLabel) {
    return null;
  }
  const className = status === "failed" ? `${styles.tileTag} ${styles.tileTagError}` : `${styles.tileTag} ${styles.tileTagStatus}`;
  return (
    <div className={styles.tileTags}>
      <span className={className}>{statusLabel}</span>
    </div>
  );
}

export function buildGalleryTagOptions(items: readonly ImageGalleryItem[]): readonly string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  items.forEach((item) => {
    item.tags.forEach((tag) => {
      const key = normalizeGalleryTag(tag);
      const current = counts.get(key);
      counts.set(key, { tag, count: (current?.count ?? 0) + 1 });
    });
  });
  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "zh-Hans-CN"))
    .map((entry) => entry.tag);
}

export function filterGalleryItemsByTag(
  items: readonly ImageGalleryItem[],
  selectedTag: string | null,
): readonly ImageGalleryItem[] {
  if (!selectedTag) {
    return items;
  }
  const selectedKey = normalizeGalleryTag(selectedTag);
  return items.filter((item) => item.tags.some((tag) => normalizeGalleryTag(tag) === selectedKey));
}

function normalizeGalleryTag(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hans-CN");
}
