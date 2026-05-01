"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createGenerationHistory,
  deleteGenerationHistory,
  listGenerationHistories,
  renameGenerationHistory,
  saveGenerationHistories,
  updateGenerationHistory,
} from "@/features/home/generation-history-storage";
import type {
  GenerationHistoryDraft,
  GenerationHistoryItem,
  GenerationHistoryUpdate,
} from "@/features/home/generation-history.types";

export function useGenerationHistory() {
  const [histories, setHistories] = useState<readonly GenerationHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedHistories = listGenerationHistories();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync localStorage snapshot on mount
    setHistories(storedHistories);
    setActiveHistoryId(storedHistories[0]?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    saveGenerationHistories(histories);
  }, [histories, hydrated]);

  const activeHistory = useMemo(
    () => histories.find((item) => item.id === activeHistoryId) ?? null,
    [activeHistoryId, histories],
  );

  const createDraft = useCallback(() => {
    setActiveHistoryId(null);
  }, []);

  const selectHistory = useCallback((historyId: string) => {
    setActiveHistoryId(historyId);
  }, []);

  const createPendingHistory = useCallback((draft: GenerationHistoryDraft) => {
    const historyId = crypto.randomUUID();
    setHistories((current) =>
      createGenerationHistory(current, { ...draft, id: historyId }),
    );
    setActiveHistoryId(historyId);
    return historyId;
  }, []);

  const updateHistory = useCallback(
    (historyId: string, patch: GenerationHistoryUpdate) => {
      setHistories((current) => updateGenerationHistory(current, historyId, patch));
    },
    [],
  );

  const queueHistory = useCallback(
    (draft: GenerationHistoryDraft) => {
      const canUpdateActive = histories.some((item) => item.id === activeHistoryId);
      if (!activeHistoryId || !canUpdateActive) {
        return createPendingHistory(draft);
      }

      updateHistory(activeHistoryId, {
        ...draft,
        status: draft.status ?? "pending",
        images: draft.images ?? [],
        errorMessage: null,
        taskId: null,
        taskStatus: null,
      });
      return activeHistoryId;
    },
    [activeHistoryId, createPendingHistory, histories, updateHistory],
  );

  const completeHistory = useCallback(
    (historyId: string, patch: GenerationHistoryUpdate) => {
      updateHistory(historyId, patch);
    },
    [updateHistory],
  );

  const failHistory = useCallback(
    (historyId: string, message: string) => {
      updateHistory(historyId, {
        status: "failed",
        errorMessage: message,
      });
    },
    [updateHistory],
  );

  const renameHistory = useCallback((historyId: string, title: string) => {
    setHistories((current) => renameGenerationHistory(current, historyId, title));
  }, []);

  const removeHistory = useCallback(
    (historyId: string) => {
      setHistories((current) => {
        const nextHistories = deleteGenerationHistory(current, historyId);
        setActiveHistoryId((currentActiveHistoryId) =>
          currentActiveHistoryId === historyId ? nextHistories[0]?.id ?? null : currentActiveHistoryId,
        );
        return nextHistories;
      });
    },
    [],
  );

  return {
    activeHistory,
    activeHistoryId,
    completeHistory,
    createDraft,
    createPendingHistory,
    failHistory,
    hydrated,
    histories,
    queueHistory,
    removeHistory,
    renameHistory,
    selectHistory,
  } as const;
}
