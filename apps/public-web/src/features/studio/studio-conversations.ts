import localforage from "localforage";
import type {
  StudioConversation,
  StudioConversationStats,
  StudioTurn,
  TurnDraft,
  TurnUpdate,
} from "@/features/studio/studio-types";

const STORAGE_KEY = "commercial_studio_conversations";
const ACTIVE_CONVERSATION_KEY = "commercial_studio_active_conversation";
export const CONVERSATIONS_CHANGED_EVENT = "studio:conversations-changed";

let writeQueue: Promise<void> = Promise.resolve();

function queueWrite(fn: () => Promise<void>) {
  writeQueue = writeQueue.then(fn).catch(() => {});
}

const store = localforage.createInstance({
  name: "commercial-studio",
  storeName: "conversations",
});

export async function listConversations(): Promise<readonly StudioConversation[]> {
  const data = await store.getItem<StudioConversation[]>(STORAGE_KEY);
  return data ?? [];
}

export function saveConversations(conversations: readonly StudioConversation[]) {
  queueWrite(async () => {
    await store.setItem(STORAGE_KEY, [...conversations]);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CONVERSATIONS_CHANGED_EVENT));
    }
  });
}

export function saveConversation(
  conversations: readonly StudioConversation[],
  conversation: StudioConversation,
): readonly StudioConversation[] {
  const index = conversations.findIndex((c) => c.id === conversation.id);
  if (index >= 0) {
    const next = [...conversations];
    next[index] = conversation;
    return next;
  }
  return [conversation, ...conversations];
}
export function deleteConversation(
  conversations: readonly StudioConversation[],
  conversationId: string,
): readonly StudioConversation[] {
  return conversations.filter((c) => c.id !== conversationId);
}

export function createConversation(title: string): StudioConversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

export function addTurnToConversation(
  conversation: StudioConversation,
  draft: TurnDraft,
): { conversation: StudioConversation; turn: StudioTurn } {
  const turn: StudioTurn = {
    id: crypto.randomUUID(),
    ...draft,
    images: [],
    status: "queued",
    taskId: null,
    taskStatus: null,
    createdAt: new Date().toISOString(),
  };
  const updated: StudioConversation = {
    ...conversation,
    updatedAt: turn.createdAt,
    turns: [...conversation.turns, turn],
  };
  return { conversation: updated, turn };
}

export function updateTurnInConversation(
  conversation: StudioConversation,
  turnId: string,
  patch: TurnUpdate,
): StudioConversation {
  return {
    ...conversation,
    updatedAt: new Date().toISOString(),
    turns: conversation.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)),
  };
}

export function getConversationStats(
  conversations: readonly StudioConversation[],
): StudioConversationStats {
  let running = 0;
  let queued = 0;
  for (const conv of conversations) {
    for (const turn of conv.turns) {
      if (turn.status === "generating") running++;
      if (turn.status === "queued") queued++;
    }
  }
  return { running, queued };
}

export function getActiveConversationId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_CONVERSATION_KEY);
}

export function setActiveConversationId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }
}
