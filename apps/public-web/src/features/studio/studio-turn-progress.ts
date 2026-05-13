export const TURN_PROGRESS_CHANGED_EVENT = "studio:turn-progress-changed";

export type TurnProgress = Readonly<{
  message: string;
  elapsedMs?: number;
}>;

const progressMap = new Map<string, TurnProgress>();

export function turnProgressKey(conversationId: string, turnId: string) {
  return `${conversationId}:${turnId}`;
}

export function setTurnProgress(key: string, progress: TurnProgress) {
  progressMap.set(key, progress);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TURN_PROGRESS_CHANGED_EVENT));
  }
}

export function clearTurnProgress(key: string) {
  progressMap.delete(key);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TURN_PROGRESS_CHANGED_EVENT));
  }
}

export function getTurnProgress(key: string): TurnProgress | undefined {
  return progressMap.get(key);
}

export function getTurnProgressSnapshot(): ReadonlyMap<string, TurnProgress> {
  return progressMap;
}

export function subscribeTurnProgress(callback: () => void): () => void {
  window.addEventListener(TURN_PROGRESS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(TURN_PROGRESS_CHANGED_EVENT, callback);
}
