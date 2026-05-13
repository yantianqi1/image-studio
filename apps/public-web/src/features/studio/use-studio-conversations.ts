"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addTurnToConversation,
  createConversation,
  deleteConversation,
  getActiveConversationId,
  listConversations,
  saveConversation,
  saveConversations,
  setActiveConversationId,
  updateTurnInConversation,
} from "@/features/studio/studio-conversations";
import type { StudioConversation, TurnDraft, TurnUpdate } from "@/features/studio/studio-types";

export function useStudioConversations() {
  const [conversations, setConversations] = useState<readonly StudioConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    listConversations().then((loaded) => {
      setConversations(loaded);
      const savedActiveId = getActiveConversationId();
      const resolvedId = loaded.find((c) => c.id === savedActiveId)?.id ?? loaded[0]?.id ?? null;
      setActiveId(resolvedId);
      setHydrated(true);
    });
  }, []);

  // Persist to IndexedDB when conversations change
  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations);
  }, [conversations, hydrated]);

  // Persist active conversation ID to localStorage
  useEffect(() => {
    if (!hydrated) return;
    setActiveConversationId(activeId);
  }, [activeId, hydrated]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [activeId, conversations],
  );

  const newConversation = useCallback((title?: string) => {
    const conv = createConversation(title ?? "新对话");
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv.id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const next = deleteConversation(prev, id);
      setActiveId((currentId) => (currentId === id ? next[0]?.id ?? null : currentId));
      return next;
    });
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c)),
    );
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
  }, []);

  const addTurn = useCallback((draft: TurnDraft) => {
    let turnId = "";
    setConversations((prev) => {
      let conv = prev.find((c) => c.id === activeId);
      if (!conv) {
        conv = createConversation(draft.prompt.slice(0, 12) || "新对话");
        setActiveId(conv.id);
      }
      const { conversation: updated, turn } = addTurnToConversation(conv, draft);
      turnId = turn.id;
      return saveConversation(prev, updated);
    });
    return turnId;
  }, [activeId]);

  const updateTurn = useCallback((conversationId: string, turnId: string, patch: TurnUpdate) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (!conv) return prev;
      const updated = updateTurnInConversation(conv, turnId, patch);
      return saveConversation(prev, updated);
    });
  }, []);

  return {
    conversations,
    activeConversation,
    activeId,
    hydrated,
    newConversation,
    selectConversation,
    removeConversation,
    renameConversation,
    clearAll,
    addTurn,
    updateTurn,
  } as const;
}
