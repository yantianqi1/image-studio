"use client";

import { memo } from "react";

import type { GenerationHistoryItem as GenerationHistoryRecord } from "@/features/home/generation-history.types";
import styles from "./generation-history.module.css";

type HistoryItemProps = Readonly<{
  item: GenerationHistoryRecord;
  active: boolean;
  editing: boolean;
  draftTitle: string;
  onSelectHistory: (historyId: string) => void;
  onStartRename: (historyId: string, title: string) => void;
  onChangeDraftTitle: (value: string) => void;
  onSaveRename: (historyId: string, title: string) => void;
  onCancelRename: () => void;
  onDeleteHistory: (historyId: string, title: string) => void;
}>;

const TITLE_PREVIEW_LENGTH = 13;
const PROMPT_PREVIEW_LENGTH = 24;

export const GenerationHistoryItem = memo(GenerationHistoryItemView, areHistoryItemPropsEqual);

function GenerationHistoryItemView(props: HistoryItemProps) {
  return (
    <article className={props.active ? `${styles.historyItem} ${styles.historyItemActive}` : styles.historyItem}>
      <div className={styles.historyItemBody}>
        {props.editing ? <EditingHistoryItem {...props} /> : <ReadonlyHistoryItem {...props} />}
      </div>
    </article>
  );
}

function EditingHistoryItem({
  draftTitle,
  item,
  onCancelRename,
  onChangeDraftTitle,
  onSaveRename,
}: HistoryItemProps) {
  return (
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
          onClick={() => onSaveRename(item.id, draftTitle)}
          aria-label="保存标题"
        >
          ✓
        </button>
      </div>
    </div>
  );
}

function ReadonlyHistoryItem({
  item,
  onDeleteHistory,
  onSelectHistory,
  onStartRename,
}: HistoryItemProps) {
  const compactTitle = formatCompactText(item.title, TITLE_PREVIEW_LENGTH);
  const compactPrompt = formatCompactText(item.prompt, PROMPT_PREVIEW_LENGTH);
  return (
    <div className="grid gap-2">
      <div className={styles.historyTitleRow}>
        <button type="button" className={styles.historyTitleButton} onClick={() => onSelectHistory(item.id)}>
          <div className={styles.historyTitle} title={compactTitle}>{compactTitle}</div>
        </button>
        <div className={styles.historyActions}>
          <button className={styles.actionButton} type="button" onClick={() => onStartRename(item.id, item.title)} aria-label="重命名历史记录">
            ✎
          </button>
          <button className={styles.actionButton} type="button" onClick={() => onDeleteHistory(item.id, item.title)} aria-label="删除历史记录">
            🗑
          </button>
        </div>
      </div>
      <button type="button" className={styles.historyPreviewButton} onClick={() => onSelectHistory(item.id)}>
        <div className={styles.previewText} title={compactPrompt}>{compactPrompt}</div>
        <HistoryMeta item={item} />
        <div className={styles.historyTime}>{formatHistoryTime(item.updatedAt)}</div>
      </button>
    </div>
  );
}

function HistoryMeta({ item }: Readonly<{ item: GenerationHistoryRecord }>) {
  return (
    <div className={styles.historyMeta}>
      <span>{item.modelName}</span>
      <span>·</span>
      <span>{item.count} 张</span>
      <span>·</span>
      <span>{item.aspectRatio}</span>
      <span className={getBadgeClass(item.status)}>{getStatusLabel(item.status)}</span>
    </div>
  );
}

function areHistoryItemPropsEqual(current: HistoryItemProps, next: HistoryItemProps) {
  return current.item === next.item &&
    current.active === next.active &&
    current.editing === next.editing &&
    current.draftTitle === next.draftTitle &&
    current.onSelectHistory === next.onSelectHistory &&
    current.onStartRename === next.onStartRename &&
    current.onChangeDraftTitle === next.onChangeDraftTitle &&
    current.onSaveRename === next.onSaveRename &&
    current.onCancelRename === next.onCancelRename &&
    current.onDeleteHistory === next.onDeleteHistory;
}

function formatCompactText(value: string, maxLength: number) {
  const compact = collectCompactText(value, maxLength);
  if (!compact.text) {
    return "暂无提示词";
  }
  return compact.truncated ? `${compact.text}…` : compact.text;
}

function collectCompactText(value: string, maxLength: number) {
  let text = "";
  let pendingSpace = false;
  for (const character of value) {
    if (character.trim() === "") {
      pendingSpace = text.length > 0;
      continue;
    }
    if (text.length >= maxLength) {
      return { text, truncated: true } as const;
    }
    const nextText = pendingSpace ? `${text} ${character}` : `${text}${character}`;
    if (nextText.length > maxLength) {
      return { text, truncated: true } as const;
    }
    text = nextText;
    pendingSpace = false;
  }
  return { text, truncated: false } as const;
}

function getBadgeClass(status: GenerationHistoryRecord["status"]) {
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

function getStatusLabel(status: GenerationHistoryRecord["status"]) {
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
