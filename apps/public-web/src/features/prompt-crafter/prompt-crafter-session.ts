import type { PromptCrafterMessage } from "./prompt-crafter-api";

const PROMPT_CRAFTER_SESSION_KEY = "commercial_studio_prompt_crafter_session";

export type PromptCrafterSession = Readonly<{
  draft: string;
  messages: readonly PromptCrafterMessage[];
  reverseNote: string;
}>;

type PromptCrafterSessionStorage = Pick<Storage, "getItem" | "setItem">;

export const EMPTY_PROMPT_CRAFTER_SESSION: PromptCrafterSession = {
  draft: "",
  messages: [],
  reverseNote: "",
};

export function readPromptCrafterSession(storage: PromptCrafterSessionStorage = localStorage): PromptCrafterSession {
  const raw = storage.getItem(PROMPT_CRAFTER_SESSION_KEY);
  if (raw === null) return EMPTY_PROMPT_CRAFTER_SESSION;
  return parsePromptCrafterSession(JSON.parse(raw));
}

export function savePromptCrafterSession(
  session: PromptCrafterSession,
  storage: PromptCrafterSessionStorage = localStorage,
) {
  storage.setItem(PROMPT_CRAFTER_SESSION_KEY, JSON.stringify(session));
}

export function buildPromptCrafterRefreshMessages(
  messages: readonly PromptCrafterMessage[],
): readonly PromptCrafterMessage[] {
  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex < 0) {
    throw new Error("没有可刷新的提示词对话");
  }
  return messages.slice(0, lastUserIndex + 1);
}

function parsePromptCrafterSession(value: unknown): PromptCrafterSession {
  if (!value || typeof value !== "object") {
    throw new Error("提示词工坊本地记录格式错误");
  }
  const session = value as Partial<PromptCrafterSession>;
  return {
    draft: readString(session.draft),
    messages: readMessages(session.messages),
    reverseNote: readString(session.reverseNote),
  };
}

function readMessages(value: unknown): readonly PromptCrafterMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("提示词工坊消息记录格式错误");
  }
  return value.map(readMessage);
}

function readMessage(value: unknown): PromptCrafterMessage {
  if (!value || typeof value !== "object") {
    throw new Error("提示词工坊消息格式错误");
  }
  const message = value as Partial<PromptCrafterMessage>;
  if (message.role !== "user" && message.role !== "assistant") {
    throw new Error("提示词工坊消息角色错误");
  }
  return { role: message.role, content: readString(message.content) };
}

function readString(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new Error("提示词工坊文本格式错误");
  }
  return value;
}

function findLastUserMessageIndex(messages: readonly PromptCrafterMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}
