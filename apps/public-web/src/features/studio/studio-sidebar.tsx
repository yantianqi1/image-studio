"use client";

import { memo, useCallback, useState } from "react";
import { Loader2, MessageSquarePlus, PanelLeft, PanelLeftClose, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { getConversationStats } from "@/features/studio/studio-conversations";
import type { StudioConversation } from "@/features/studio/studio-types";

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
      <aside className="flex h-full flex-col items-center border-r border-gray-100 bg-gray-50/80 py-3">
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
          onClick={onToggleCollapse}
          aria-label="展开侧边栏"
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          type="button"
          className="mt-3 inline-flex size-9 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 transition hover:border-gray-400 hover:bg-white hover:text-gray-600"
          onClick={onNew}
          aria-label="新对话"
        >
          <Plus className="size-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-gray-100 bg-gray-50/80">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          创作台
          {(stats.running > 0 || stats.queued > 0) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
              {stats.running > 0 && (
                <span className="flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {stats.running}
                </span>
              )}
              {stats.running > 0 && stats.queued > 0 && <span className="text-blue-300">|</span>}
              {stats.queued > 0 && (
                <span className="flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  {stats.queued}
                </span>
              )}
            </span>
          )}
        </span>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
          onClick={onToggleCollapse}
          aria-label="收起侧边栏"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      {/* New conversation button */}
      <div className="shrink-0 px-2.5 pt-2.5">
        <button
          type="button"
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-gray-900 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
          onClick={onNew}
        >
          <MessageSquarePlus className="size-4" />
          新建对话
        </button>
      </div>

      {/* Conversation list */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
        {conversations.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs leading-5 text-gray-400">
            还没有记录，输入提示词后会在这里显示。
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((conv) => {
              const active = conv.id === activeId;
              return (
                <div
                  key={conv.id}
                  className={cn(
                    "group relative w-full rounded-xl border text-left transition",
                    active
                      ? "border-gray-200 bg-white text-gray-900 shadow-sm"
                      : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-white",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    className="block w-full px-3 py-2.5 pr-8 text-left"
                  >
                    <div className="truncate text-sm font-medium">{conv.title}</div>
                    <div className={cn("mt-0.5 text-[11px]", active ? "text-gray-500" : "text-gray-400")}>
                      {conv.turns.length} 轮 · {formatTime(conv.updatedAt)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 opacity-100 transition hover:bg-red-50 hover:text-red-500 lg:size-6 lg:text-gray-300 lg:opacity-0 lg:group-hover:opacity-100"
                    aria-label={`删除 ${conv.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {conversations.length > 0 && (
        <div className="shrink-0 border-t border-gray-100 px-3 py-2">
          <button
            type="button"
            className="w-full rounded-lg px-2 py-1.5 text-xs text-gray-400 transition hover:bg-red-50 hover:text-red-500"
            onClick={handleClear}
          >
            {confirmClear ? "确认清空全部？" : "清空全部"}
          </button>
        </div>
      )}
    </aside>
  );
});
