import type { PromptCrafterStreamOptions } from "@/features/prompt-crafter/prompt-crafter-api";
import { buildPromptComplianceInstruction } from "@/features/studio/studio-prompt-actions";

const EMPTY_ORIGINAL_PROMPT_ERROR = "原始提示词为空";
const EMPTY_COMPLIANCE_REWRITE_ERROR = "合规化提示词结果为空";

export type PromptRewriteStreamer = (options: PromptCrafterStreamOptions) => Promise<void>;

export async function rewritePromptForCompliance(input: Readonly<{
  prompt: string;
  signal?: AbortSignal;
  streamPrompt: PromptRewriteStreamer;
}>): Promise<string> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error(EMPTY_ORIGINAL_PROMPT_ERROR);
  }

  let rewritten = "";
  await input.streamPrompt({
    messages: [{ role: "user", content: buildPromptComplianceInstruction(prompt) }],
    signal: input.signal,
    onChunk: (chunk) => {
      rewritten += chunk;
    },
  });

  const result = rewritten.trim();
  if (!result) {
    throw new Error(EMPTY_COMPLIANCE_REWRITE_ERROR);
  }
  return result;
}
