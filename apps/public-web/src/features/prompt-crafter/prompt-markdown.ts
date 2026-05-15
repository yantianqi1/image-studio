export type PromptMarkdownBlock = Readonly<
  | { type: "code"; code: string; language: string }
  | { type: "heading"; level: number; text: string }
  | { type: "ordered-list"; items: readonly string[] }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "rule" }
  | { type: "unordered-list"; items: readonly string[] }
>;

export type PromptMarkdownOption = Readonly<{
  prompt: string;
  title: string;
}>;

const CODE_FENCE = "```";
const MAX_HEADING_LEVEL = 3;
const MIN_HEADING_LEVEL = 1;
const ORDERED_LIST_PATTERN = /^\d+\.\s+/;
const UNORDERED_LIST_PATTERN = /^[-*]\s+/;
const PROMPT_CODE_LANGUAGES = new Set(["", "prompt", "text"]);

export function parsePromptMarkdown(source: string): readonly PromptMarkdownBlock[] {
  const lines = normalizePromptMarkdown(source).split("\n");
  const blocks: PromptMarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const parsed = parsePromptMarkdownBlock(lines, index);
    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }
  return blocks;
}

export function extractPromptOptionsFromMarkdown(source: string): readonly PromptMarkdownOption[] {
  const blocks = parsePromptMarkdown(source);
  const options: PromptMarkdownOption[] = [];
  let currentTitle = "";

  for (const block of blocks) {
    if (block.type === "heading") {
      currentTitle = block.text;
      continue;
    }
    if (block.type !== "code" || !isPromptCodeBlock(block)) {
      continue;
    }
    const prompt = block.code.trim();
    if (prompt) {
      options.push({ title: currentTitle || `方案 ${options.length + 1}`, prompt });
    }
  }

  return options;
}

function parsePromptMarkdownBlock(lines: readonly string[], index: number) {
  const line = lines[index] ?? "";
  if (line.startsWith(CODE_FENCE)) {
    return parseCodeBlock(lines, index);
  }
  if (isHeadingLine(line)) {
    return parseHeadingBlock(line, index);
  }
  if (UNORDERED_LIST_PATTERN.test(line.trim())) {
    return parseListBlock(lines, index, "unordered-list", UNORDERED_LIST_PATTERN);
  }
  if (ORDERED_LIST_PATTERN.test(line.trim())) {
    return parseListBlock(lines, index, "ordered-list", ORDERED_LIST_PATTERN);
  }
  if (line.trimStart().startsWith(">")) {
    return parseQuoteBlock(lines, index);
  }
  if (isRuleLine(line)) {
    return { block: { type: "rule" } as const, nextIndex: index + 1 };
  }
  return parseParagraphBlock(lines, index);
}

function parseCodeBlock(lines: readonly string[], index: number) {
  const language = lines[index]?.slice(CODE_FENCE.length).trim() ?? "";
  const codeLines: string[] = [];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && !lines[nextIndex]?.startsWith(CODE_FENCE)) {
    codeLines.push(lines[nextIndex] ?? "");
    nextIndex += 1;
  }
  return {
    block: { type: "code", language, code: codeLines.join("\n") } as const,
    nextIndex: nextIndex < lines.length ? nextIndex + 1 : nextIndex,
  };
}

function parseHeadingBlock(line: string, index: number) {
  const marker = line.match(/^#{1,3}\s+/)?.[0] ?? "# ";
  return {
    block: { type: "heading", level: marker.trim().length, text: line.slice(marker.length).trim() } as const,
    nextIndex: index + 1,
  };
}

function parseListBlock(
  lines: readonly string[],
  index: number,
  type: "ordered-list" | "unordered-list",
  pattern: RegExp,
) {
  const items: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length && pattern.test(lines[nextIndex]?.trim() ?? "")) {
    items.push((lines[nextIndex] ?? "").trim().replace(pattern, "").trim());
    nextIndex += 1;
  }
  return { block: { type, items } as const, nextIndex };
}

function parseQuoteBlock(lines: readonly string[], index: number) {
  const quoteLines: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length && (lines[nextIndex] ?? "").trimStart().startsWith(">")) {
    quoteLines.push((lines[nextIndex] ?? "").trimStart().replace(/^>\s?/, ""));
    nextIndex += 1;
  }
  return { block: { type: "quote", text: quoteLines.join("\n") } as const, nextIndex };
}

function parseParagraphBlock(lines: readonly string[], index: number) {
  const paragraphLines: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length && shouldKeepParagraphLine(lines[nextIndex] ?? "")) {
    paragraphLines.push((lines[nextIndex] ?? "").trim());
    nextIndex += 1;
  }
  return { block: { type: "paragraph", text: paragraphLines.join("\n") } as const, nextIndex };
}

function shouldKeepParagraphLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    Boolean(trimmed) &&
    !line.startsWith(CODE_FENCE) &&
    !isHeadingLine(line) &&
    !isRuleLine(line) &&
    !UNORDERED_LIST_PATTERN.test(trimmed) &&
    !ORDERED_LIST_PATTERN.test(trimmed) &&
    !line.trimStart().startsWith(">")
  );
}

function isHeadingLine(line: string): boolean {
  const heading = line.match(/^(#{1,6})\s+/);
  if (!heading) {
    return false;
  }
  const level = heading[1].length;
  return level >= MIN_HEADING_LEVEL && level <= MAX_HEADING_LEVEL;
}

function isRuleLine(line: string): boolean {
  return /^-{3,}$/.test(line.trim());
}

function normalizePromptMarkdown(source: string): string {
  return source.replaceAll("\r\n", "\n").trim();
}

function isPromptCodeBlock(block: Extract<PromptMarkdownBlock, { type: "code" }>): boolean {
  return PROMPT_CODE_LANGUAGES.has(block.language.trim().toLowerCase());
}
