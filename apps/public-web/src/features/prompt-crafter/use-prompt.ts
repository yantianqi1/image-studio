export const PROMPT_CRAFTER_USE_PROMPT_EVENT = "prompt-crafter:use-prompt";

type PromptCrafterUsePromptDetail = Readonly<{
  prompt: string;
}>;

export function buildGeneratePromptHref(prompt: string): string {
  return `/generate?prompt=${encodeURIComponent(prompt)}`;
}

export function applyPromptToGenerate(prompt: string): void {
  const trimmed = prompt.trim();
  if (!trimmed || typeof window === "undefined") {
    return;
  }
  if (window.location.pathname === "/generate") {
    dispatchPromptCrafterUsePrompt(trimmed);
    return;
  }
  window.location.assign(buildGeneratePromptHref(trimmed));
}

export function listenPromptCrafterUsePrompt(
  handler: (prompt: string) => void,
): () => void {
  const listener = (event: Event) => {
    const prompt = readPromptCrafterEventPrompt(event);
    if (prompt) {
      handler(prompt);
    }
  };
  window.addEventListener(PROMPT_CRAFTER_USE_PROMPT_EVENT, listener);
  return () => window.removeEventListener(PROMPT_CRAFTER_USE_PROMPT_EVENT, listener);
}

export function readGeneratePromptParam(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get("prompt")?.trim() ?? "";
}

export function clearGeneratePromptParam(): void {
  if (typeof window === "undefined" || !window.location.search.includes("prompt=")) {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("prompt");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function dispatchPromptCrafterUsePrompt(prompt: string): void {
  window.dispatchEvent(
    new CustomEvent<PromptCrafterUsePromptDetail>(PROMPT_CRAFTER_USE_PROMPT_EVENT, {
      detail: { prompt },
    }),
  );
}

function readPromptCrafterEventPrompt(event: Event): string {
  if (!("detail" in event)) {
    return "";
  }
  const detail = (event as CustomEvent<Partial<PromptCrafterUsePromptDetail>>).detail;
  return typeof detail?.prompt === "string" ? detail.prompt.trim() : "";
}
