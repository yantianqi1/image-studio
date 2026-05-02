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
const PROMPT_CRAFTER_SSE_SEPARATOR = "\n\n";

type PromptCrafterSseEvent = Readonly<
  | { type: "chunk"; content: string }
  | { type: "done" }
  | { type: "start" }
>;

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

  await readPromptCrafterEventStream(response, options.onChunk);
}

export async function readPromptCrafterEventStream(
  response: Response,
  onChunk: (chunk: string) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("提示词流响应为空");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  await readPromptCrafterChunks({ buffer: "", decoder, onChunk, reader });
}

export const readPromptCrafterTextStream = readPromptCrafterEventStream;

function buildPromptCrafterHeaders(): Headers {
  const headers = new Headers({ Accept: "text/event-stream", "Content-Type": "application/json" });
  for (const [key, value] of Object.entries(getClientProviderRequestHeaders())) {
    headers.set(key, value);
  }
  return headers;
}

async function readPromptCrafterChunks(input: Readonly<{
  buffer: string;
  decoder: TextDecoder;
  onChunk: (chunk: string) => void;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}>): Promise<void> {
  let buffer = input.buffer;
  for (;;) {
    const { value, done } = await input.reader.read();
    if (done) {
      buffer = consumePromptCrafterSseBuffer(buffer + input.decoder.decode(), input.onChunk);
      consumePromptCrafterSseBuffer(`${buffer}${PROMPT_CRAFTER_SSE_SEPARATOR}`, input.onChunk);
      return;
    }
    buffer = consumePromptCrafterSseBuffer(buffer + input.decoder.decode(value, { stream: true }), input.onChunk);
  }
}

export function parsePromptCrafterSseBlock(block: string): PromptCrafterSseEvent | null {
  const lines = block.replaceAll("\r\n", "\n").split("\n");
  const event = readPromptCrafterSseEventName(lines);
  const data = readPromptCrafterSseData(lines);
  if (!event && !data.trim()) {
    return null;
  }
  return buildPromptCrafterSseEvent(event || "message", data);
}

function consumePromptCrafterSseBuffer(buffer: string, onChunk: (chunk: string) => void): string {
  const normalized = buffer.replaceAll("\r\n", "\n");
  let remainder = normalized;
  for (;;) {
    const splitIndex = remainder.indexOf(PROMPT_CRAFTER_SSE_SEPARATOR);
    if (splitIndex < 0) {
      return remainder;
    }
    emitPromptCrafterSseEvent(remainder.slice(0, splitIndex), onChunk);
    remainder = remainder.slice(splitIndex + PROMPT_CRAFTER_SSE_SEPARATOR.length);
  }
}

function emitPromptCrafterSseEvent(block: string, onChunk: (chunk: string) => void): void {
  const event = parsePromptCrafterSseBlock(block);
  if (event?.type === "chunk" && event.content) {
    onChunk(event.content);
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

function readPromptCrafterSseEventName(lines: readonly string[]): string {
  return lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim() ?? "";
}

function readPromptCrafterSseData(lines: readonly string[]): string {
  return lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""))
    .join("\n");
}

function buildPromptCrafterSseEvent(event: string, data: string): PromptCrafterSseEvent | null {
  if (event === "start" || event === "done") {
    return { type: event };
  }
  if (event === "error") {
    throw new Error(readPromptCrafterSseError(data));
  }
  return buildPromptCrafterChunkEvent(data);
}

function buildPromptCrafterChunkEvent(data: string): PromptCrafterSseEvent | null {
  if (!data.trim()) {
    return null;
  }
  const payload = parsePromptCrafterSseJson(data);
  if (payload && typeof payload === "object" && "content" in payload) {
    const content = (payload as { content?: unknown }).content;
    return typeof content === "string" ? { type: "chunk", content } : null;
  }
  return typeof payload === "string" ? { type: "chunk", content: payload } : { type: "chunk", content: data };
}

function readPromptCrafterSseError(data: string): string {
  const payload = parsePromptCrafterSseJson(data);
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    return typeof message === "string" && message.trim() ? message : "提示词流错误";
  }
  return data.trim() || "提示词流错误";
}

function parsePromptCrafterSseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
