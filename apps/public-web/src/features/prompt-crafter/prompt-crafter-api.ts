import { getClientProviderRequestHeaders } from "@/lib/client-provider-config";

export type PromptCrafterMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export type PromptCrafterStreamOptions = Readonly<{
  messages: readonly PromptCrafterMessage[];
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}>;

const PROMPT_CRAFTER_STREAM_ENDPOINT = "/api/public/prompt-crafter/chat/stream";

export function buildPromptCrafterStreamPayload(messages: readonly PromptCrafterMessage[]) {
  return { messages };
}

export async function streamPromptCrafter(options: PromptCrafterStreamOptions): Promise<void> {
  const response = await fetch(PROMPT_CRAFTER_STREAM_ENDPOINT, {
    method: "POST",
    headers: buildPromptCrafterHeaders(),
    body: JSON.stringify(buildPromptCrafterStreamPayload(options.messages)),
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readPromptCrafterErrorMessage(response));
  }

  await readPromptCrafterTextStream(response, options.onChunk);
}

export async function readPromptCrafterTextStream(
  response: Response,
  onChunk: (chunk: string) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("提示词流响应为空");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  await readPromptCrafterChunks({ decoder, onChunk, reader });
}

function buildPromptCrafterHeaders(): Headers {
  const headers = new Headers({ Accept: "text/plain", "Content-Type": "application/json" });
  for (const [key, value] of Object.entries(getClientProviderRequestHeaders())) {
    headers.set(key, value);
  }
  return headers;
}

async function readPromptCrafterChunks(input: Readonly<{
  decoder: TextDecoder;
  onChunk: (chunk: string) => void;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}>): Promise<void> {
  for (;;) {
    const { value, done } = await input.reader.read();
    if (done) {
      emitDecodedChunk(input.decoder.decode(), input.onChunk);
      return;
    }
    emitDecodedChunk(input.decoder.decode(value, { stream: true }), input.onChunk);
  }
}

function emitDecodedChunk(chunk: string, onChunk: (chunk: string) => void): void {
  if (chunk) {
    onChunk(chunk);
  }
}

async function readPromptCrafterErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text.trim()) {
    return `提示词生成失败：${response.status}`;
  }
  try {
    return extractPromptCrafterEnvelopeError(JSON.parse(text), text);
  } catch {
    return text;
  }
}

function extractPromptCrafterEnvelopeError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message;
    }
  }
  return fallback;
}
