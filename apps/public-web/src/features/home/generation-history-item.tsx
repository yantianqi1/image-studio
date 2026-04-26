"use client";

import type { GenerationHistoryItem } from "@/features/home/generation-history.types";
import styles from "./generation-history.module.css";

type HistoryItemProps = Readonly<{
  item: GenerationHistoryItem;
  active: boolean;
  editing: boolean;
  draftTitle: string;
  onSelect: () => void;
  onStartRename: () => void;
  onChangeDraftTitle: (value: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}>;

export function GenerationHistoryItem({
  item,
  active,
  editing,
  draftTitle,
  onSelect,
  onStartRename,
  onChangeDraftTitle,
  onSaveRename,
  onCancelRename,
  onDelete,
}: HistoryItemProps) {
  return (
    <article className={active ? `${styles.historyItem} ${styles.historyItemActive}` : styles.historyItem}>
      <div className={styles.historyItemBody}>
        {editing ? (
          <div className="grid gap-2">
            <input
              autoFocus
              className={styles.titleInput}
              maxLength={40}
              placeholder="请输入标题"
              value={draftTitle}
              onChange={(event) => onChangeDraftTitle(event.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <button className={styles.actionButton} type="button" onClick={onCancelRename} aria-label="取消重命名">
                ×
              </button>
              <button
                className={styles.actionButton}
                type="button"
                disabled={!draftTitle.trim()}
                onClick={onSaveRename}
                aria-label="保存标题"
              >
                ✓
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <div className={styles.historyTitleRow}>
              <button type="button" className={styles.historyTitleButton} onClick={onSelect}>
                <div className={styles.historyTitle} title={item.title}>{formatCompactText(item.title, TITLE_PREVIEW_LENGTH)}</div>
              </button>
              <div className={styles.historyActions}>
                <button className={styles.actionButton} type="button" onClick={onStartRename} aria-label="重命名历史记录">
                  ✎
                </button>
                <button className={styles.actionButton} type="button" onClick={onDelete} aria-label="删除历史记录">
                  🗑
                </button>
              </div>
            </div>
            <button type="button" className={styles.historyPreviewButton} onClick={onSelect}>
              <div className={styles.previewText} title={item.prompt}>{formatCompactText(item.prompt, PROMPT_PREVIEW_LENGTH)}</div>
              <div className={styles.historyMeta}>
                <span>{item.modelName}</span>
                <span>·</span>
                <span>{item.count} 张</span>
                <span>·</span>
                <span>{item.aspectRatio}</span>
                <span className={getBadgeClass(item.status)}>{getStatusLabel(item.status)}</span>
              </div>
              <div className={styles.historyTime}>{formatHistoryTime(item.updatedAt)}</div>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

const TITLE_PREVIEW_LENGTH = 13;
const PROMPT_PREVIEW_LENGTH = 24;

function formatCompactText(value: string, maxLength: number) {
  const collapsed = value.trim().replace(/\s+/g, " ");

  if (!collapsed) {
    return "暂无提示词";
  }

  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength)}…`
    : collapsed;
}

function getBadgeClass(status: GenerationHistoryItem["status"]) {
  switch (status) {
    case "pending":
      return `${styles.historyBadge} ${styles.historyBadgePending}`;
    case "generating":
      return `${styles.historyBadge} ${styles.historyBadgeGenerating}`;
    case "success":
      return `${styles.historyBadge} ${styles.historyBadgeSuccess}`;
    case "failed":
      return `${styles.historyBadge} ${styles.historyBadgeFailed}`;
    default:
      return `${styles.historyBadge} ${styles.historyBadgeIdle}`;
  }
}

function getStatusLabel(status: GenerationHistoryItem["status"]) {
  switch (status) {
    case "pending":
      return "等待中";
    case "generating":
      return "生成中";
    case "success":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return "草稿";
  }
}

function formatHistoryTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "刚刚";
  }

  if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  }

  if (diff < 2 * day) {
    return "昨天";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
