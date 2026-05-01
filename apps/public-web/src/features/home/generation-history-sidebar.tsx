"use client";

import { useCallback, useMemo, useState } from "react";

import { GenerationHistoryItem } from "@/features/home/generation-history-item";
import type { GenerationHistoryItem as GenerationHistoryRecord } from "@/features/home/generation-history.types";
import { BrandMark } from "@/features/shell/brand-mark";
import styles from "./generation-history.module.css";

type GenerationHistorySidebarProps = Readonly<{
  histories: readonly GenerationHistoryRecord[];
  activeHistoryId: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onNewGeneration: () => void;
  onSelectHistory: (historyId: string) => void;
  onRenameHistory: (historyId: string, title: string) => void;
  onDeleteHistory: (historyId: string) => void;
  walletLabel: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}>;

export function GenerationHistorySidebar({
  histories,
  activeHistoryId,
  searchQuery,
  onSearchQueryChange,
  onNewGeneration,
  onSelectHistory,
  onRenameHistory,
  onDeleteHistory,
  walletLabel,
  collapsed = false,
  onToggleCollapsed,
}: GenerationHistorySidebarProps) {
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const handleSelectHistory = useCallback((historyId: string) => {
    onSelectHistory(historyId);
  }, [onSelectHistory]);
  const handleStartRename = useCallback((historyId: string, title: string) => {
    setEditingHistoryId(historyId);
    setDraftTitle(title);
  }, []);
  const handleCancelRename = useCallback(() => {
    setEditingHistoryId(null);
    setDraftTitle("");
  }, []);
  const handleSaveRename = useCallback((historyId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    onRenameHistory(historyId, nextTitle);
    setEditingHistoryId(null);
    setDraftTitle("");
  }, [onRenameHistory]);
  const handleDeleteHistory = useCallback((historyId: string, title: string) => {
    if (!window.confirm(`确定删除「${title}」吗？`)) {
      return;
    }
    onDeleteHistory(historyId);
    if (editingHistoryId === historyId) {
      setEditingHistoryId(null);
      setDraftTitle("");
    }
  }, [editingHistoryId, onDeleteHistory]);

  const filteredHistories = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return histories;
    }

    return histories.filter((item) => {
      const haystack = [item.title, item.prompt, item.modelName].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [histories, searchQuery]);

  if (collapsed) {
    return (
      <CollapsedSidebar
        activeCount={histories.length}
        onNewGeneration={onNewGeneration}
        onToggleCollapsed={onToggleCollapsed}
      />
    );
  }

  const historyList = filteredHistories.length > 0 ? (
    filteredHistories.map((item) => (
      <GenerationHistoryItem
        key={item.id}
        item={item}
        active={item.id === activeHistoryId}
        editing={editingHistoryId === item.id}
        draftTitle={editingHistoryId === item.id ? draftTitle : item.title}
        onChangeDraftTitle={setDraftTitle}
        onCancelRename={handleCancelRename}
        onDeleteHistory={handleDeleteHistory}
        onSaveRename={handleSaveRename}
        onSelectHistory={handleSelectHistory}
        onStartRename={handleStartRename}
      />
    ))
  ) : searchQuery.trim() ? (
    <EmptyState title="没有找到相关记录" description="请尝试使用其他关键词搜索历史记录。" />
  ) : (
    <EmptyState title="暂无历史记录" description="生成图像后，记录会显示在这里。" />
  );

  return (
    <aside className={`${styles.sidebarShell} ${styles.desktopSidebar}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={styles.sidebarTitle}>
          <div className={styles.sidebarBrand}>
            <BrandMark />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">History</p>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-gray-950">历史记录</h2>
          </div>
        </div>
        <button className={styles.menuButton} type="button" onClick={onToggleCollapsed} aria-label="折叠历史记录">
          ‹
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <button className={styles.newButton} type="button" onClick={onNewGeneration}>
          新建生成
        </button>
      </div>

      <div className="mt-3">
        <input
          className={styles.sidebarSearch}
          placeholder="搜索历史记录"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-hidden">
        <div className={styles.sidebarList}>{historyList}</div>
      </div>

      <footer className={styles.sidebarFooter}>
        <div className="grid gap-2 text-sm text-gray-600">
          <div className="flex items-center justify-between gap-2">
            <span>钱包</span>
            <a className="font-medium text-gray-900 hover:underline" href="/wallet">
              {walletLabel}
            </a>
          </div>
          <a className="text-sm text-gray-600 hover:text-gray-900" href="/login">
            账号入口
          </a>
        </div>
      </footer>
    </aside>
  );
}

function EmptyState({ title, description }: Readonly<{ title: string; description: string }>) {
  return (
    <div className={styles.historyEmpty}>
      <div className="grid justify-items-center gap-3">
        <div className={styles.historyEmptyIcon}>
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
          </svg>
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="max-w-[15rem] text-xs leading-5 text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

function CollapsedSidebar({
  activeCount,
  onNewGeneration,
  onToggleCollapsed,
}: Readonly<{
  activeCount: number;
  onNewGeneration: () => void;
  onToggleCollapsed?: () => void;
}>) {
  return (
    <aside className={`${styles.sidebarShell} ${styles.sidebarCollapsed} ${styles.desktopSidebar}`}>
      <button className={styles.sidebarBrand} type="button" onClick={onToggleCollapsed} aria-label="展开历史记录">
        <BrandMark />
      </button>
      <div className={styles.collapsedActions}>
        <button className={styles.collapsedIconButton} type="button" onClick={onNewGeneration} aria-label="新建生成">
          +
        </button>
        <button className={styles.collapsedIconButton} type="button" onClick={onToggleCollapsed} aria-label="查看历史记录">
          <span aria-hidden="true">☰</span>
          {activeCount > 0 ? <span className={styles.collapsedBadge}>{activeCount}</span> : null}
        </button>
      </div>
      <button className={styles.collapsedIconButton} type="button" onClick={onToggleCollapsed} aria-label="展开侧边栏">
        ›
      </button>
    </aside>
  );
}
