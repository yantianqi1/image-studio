"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addTurnToConversation,
  createConversation,
  deleteConversation,
  getActiveConversationId,
  getCachedConversations,
  listConversations,
  removeTurnFromConversation,
  retryTurnInConversation,
  retryTurnWithPromptInConversation,
  saveConversation,
  saveConversations,
  setActiveConversationId,
  updateTurnInConversation,
} from "@/features/studio/studio-conversations";
import type { StudioConversation, TurnDraft, TurnUpdate } from "@/features/studio/studio-types";
import { migrateHistoryIfNeeded } from "@/features/studio/studio-migrate-history";

export function useStudioConversations() {
  const cachedConversations = getCachedConversations();
  const [conversations, setConversations] = useState<readonly StudioConversation[]>(() => cachedConversations ?? []);
  const [activeId, setActiveId] = useState<string | null>(() => resolveInitialActiveId(cachedConversations ?? []));
  const [hydrated, setHydrated] = useState(cachedConversations !== null);

  // Load from IndexedDB on mount
  useEffect(() => {
    if (hydrated) return;
    let active = true;
    listConversations().then((loaded) => {
      if (!active) return;
      const migrated = migrateHistoryIfNeeded();
      const merged = migrated.length > 0 ? [...migrated, ...loaded] : loaded;
      setConversations(merged);
      setActiveId(resolveInitialActiveId(merged));
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [hydrated]);

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

  const addTurn = useCallback((draft: TurnDraft): { turnId: string; conversationId: string } => {
    const existingConversation = conversations.find((c) => c.id === activeId) ?? null;
    const conversation = existingConversation ?? createConversation(draft.prompt.slice(0, 12) || "新对话");
    const { conversation: updated, turn } = addTurnToConversation(conversation, draft);
    setConversations((prev) => saveConversation(prev, updated));
    if (!existingConversation) {
      setActiveId(conversation.id);
    }
    return { turnId: turn.id, conversationId: conversation.id };
  }, [activeId, conversations]);

  const updateTurn = useCallback((conversationId: string, turnId: string, patch: TurnUpdate) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (!conv) return prev;
      const updated = updateTurnInConversation(conv, turnId, patch);
      return saveConversation(prev, updated);
    });
  }, []);

  const removeTurn = useCallback((conversationId: string, turnId: string) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (!conv) return prev;
      const updated = removeTurnFromConversation(conv, turnId);
      if (!updated) return prev;
      return saveConversation(prev, updated);
    });
  }, []);

  const retryTurn = useCallback((conversationId: string, turnId: string) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (!conv) return prev;
      const updated = retryTurnInConversation(conv, turnId);
      if (!updated) return prev;
      return saveConversation(prev, updated);
    });
  }, []);

  const retryTurnWithPrompt = useCallback((conversationId: string, turnId: string, prompt: string) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (!conv) return prev;
      const updated = retryTurnWithPromptInConversation(conv, turnId, prompt.trim());
      if (!updated) return prev;
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
    removeTurn,
    retryTurn,
    retryTurnWithPrompt,
  } as const;
}

function resolveInitialActiveId(conversations: readonly StudioConversation[]): string | null {
  const savedActiveId = getActiveConversationId();
  return conversations.find((c) => c.id === savedActiveId)?.id ?? conversations[0]?.id ?? null;
}
