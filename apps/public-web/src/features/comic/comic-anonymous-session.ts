"use client";

import { isUnauthorizedApiError } from "@/lib/api-client";
import { publicApi } from "@/lib/public-api";

export const COMIC_OWNER_CHANGED_EVENT = "comic-owner-changed";

export async function ensureComicAnonymousSession(): Promise<void> {
  try {
    await publicApi.getCurrentUser();
  } catch (error: unknown) {
    if (!isUnauthorizedApiError(error)) {
      throw error;
    }
    await publicApi.ensureAnonymousSession();
  }
}

export function notifyComicOwnerChanged(): void {
  window.dispatchEvent(new Event(COMIC_OWNER_CHANGED_EVENT));
}

export function listenComicOwnerChanged(listener: () => void): () => void {
  window.addEventListener(COMIC_OWNER_CHANGED_EVENT, listener);
  return () => window.removeEventListener(COMIC_OWNER_CHANGED_EVENT, listener);
}
