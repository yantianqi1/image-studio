import { useEffect, useRef, useState } from "react";

import type { GenerationHistoryItem } from "@/features/home/generation-history.types";
import type { ImageFormState } from "@/features/home/generation-workbench.types";
import { INITIAL_FORM } from "@/features/home/generation-workbench-helpers";

const REUSE_PROMPT_PARAM = "prompt";

type UseGenerationReusePromptOptions = Readonly<{
  activeHistory: GenerationHistoryItem | null;
  createDraft: () => void;
  hydrated: boolean;
  onApplyPrompt: (pendingReusePrompt: string) => void;
}>;

export function useGenerationReusePrompt({
  activeHistory,
  createDraft,
  hydrated,
  onApplyPrompt,
}: UseGenerationReusePromptOptions) {
  const appliedRef = useRef(false);
  const [pendingReusePrompt, setPendingReusePrompt] = useState("");

  useEffect(() => {
    if (!hydrated || appliedRef.current) {
      return;
    }

    appliedRef.current = true;
    const reusePrompt = readReusePromptFromLocation();
    if (!reusePrompt) {
      return;
    }

    createDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- store URL prompt until history draft is active
    setPendingReusePrompt(reusePrompt);
  }, [createDraft, hydrated]);

  useEffect(() => {
    if (!pendingReusePrompt || activeHistory !== null) {
      return;
    }

    onApplyPrompt(pendingReusePrompt);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear one-shot URL prompt after applying it
    setPendingReusePrompt("");
  }, [activeHistory, onApplyPrompt, pendingReusePrompt]);
}

export function readReusePromptFromLocation() {
  const location = getBrowserLocation();
  if (!location) {
    return "";
  }

  const params = new URLSearchParams(location.search);
  return params.get(REUSE_PROMPT_PARAM)?.trim() ?? "";
}

export function buildReusePromptForm(pendingReusePrompt: string): ImageFormState {
  return {
    ...INITIAL_FORM,
    prompt: pendingReusePrompt,
  };
}

function getBrowserLocation() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.location;
}
