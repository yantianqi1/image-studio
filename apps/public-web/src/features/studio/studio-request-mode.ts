import type { ComposerMode, StudioMode } from "@/features/studio/studio-types";

export function resolveStudioDraftMode(input: Readonly<{
  composerMode: ComposerMode;
  referenceCount: number;
}>): StudioMode {
  if (input.composerMode === "chat") {
    return "chat";
  }
  return input.referenceCount > 0 ? "edit" : "generate";
}
