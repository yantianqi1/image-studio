"use client";

import { memo, useCallback, useState } from "react";

import { getConversationStats } from "@/features/studio/studio-conversations";
import type { StudioConversation } from "@/features/studio/studio-types";
import styles from "./studio-sidebar.module.css";

type StudioSidebarProps = Readonly<{
  conversations: readonly StudioConversation[];
  activeId: string | null;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onToggleCollapse: () => void;
}>;

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const StudioSidebar = memo(function StudioSidebar({
  conversations,
  activeId,
  collapsed,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  onToggleCollapse,
}: StudioSidebarProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const stats = getConversationStats(conversations);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      onClearAll();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, onClearAll]);

  if (collapsed) {
    return (
      <aside className={`${styles.sidebar} ${styles.sidebarCollapsed}`}>
        <div className={styles.header}>
          <button className={styles.collapseButton} onClick={onToggleCollapse} aria-label="展开侧边栏">
            &#9654;
          </button>
        </div>
        <button
          className={`${styles.newButton} ${styles.newButtonCollapsed}`}
          onClick={onNew}
          aria-label="新对话"
        >
          +
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>
          创作台
          {(stats.running > 0 || stats.queued > 0) && (
            <span className={styles.statsBadge} style={{ marginLeft: "0.5rem" }}>
              {stats.running > 0 && `${stats.running} 运行`}
              {stats.running > 0 && stats.queued > 0 && " · "}
              {stats.queued > 0 && `${stats.queued} 排队`}
            </span>
          )}
        </span>
        <button className={styles.collapseButton} onClick={onToggleCollapse} aria-label="收起侧边栏">
          &#9664;
        </button>
      </div>

      <button className={styles.newButton} onClick={onNew}>
        + 新对话
      </button>

      <div className={styles.list}>
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`${styles.item} ${conv.id === activeId ? styles.itemActive : ""}`}
            onClick={() => onSelect(conv.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(conv.id);
            }}
          >
            <div className={styles.itemContent}>
              <div className={styles.itemTitle}>{conv.title}</div>
              <div className={styles.itemTime}>{formatTime(conv.updatedAt)}</div>
            </div>
            <button
              className={styles.deleteButton}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              aria-label={`删除 ${conv.title}`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {conversations.length > 0 && (
        <div className={styles.footer}>
          <button className={styles.clearButton} onClick={handleClear}>
            {confirmClear ? "确认清空全部？" : "清空全部"}
          </button>
        </div>
      )}
    </aside>
  );
});
