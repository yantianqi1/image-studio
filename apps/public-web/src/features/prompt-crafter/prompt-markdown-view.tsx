import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { parsePromptMarkdown, type PromptMarkdownBlock } from "./prompt-markdown";
import styles from "./prompt-markdown.module.css";

type PromptMarkdownViewProps = Readonly<{
  markdown: string;
  onCopy?: () => Promise<void>;
  streaming: boolean;
}>;

type CopyStatus = "idle" | "success" | "error";

export function PromptMarkdownView(props: PromptMarkdownViewProps) {
  const blocks = useMemo(() => parsePromptMarkdown(props.markdown), [props.markdown]);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  useEffect(() => setCopyStatus("idle"), [props.markdown]);

  return (
    <div className={styles.markdownShell}>
      <MarkdownToolbar
        copyStatus={copyStatus}
        disabled={props.streaming || !props.markdown.trim()}
        onCopy={props.onCopy}
        setCopyStatus={setCopyStatus}
      />
      <div className={styles.markdown}>
        {blocks.length > 0 ? blocks.map((block, index) => renderMarkdownBlock(block, index)) : <p className={styles.pending}>...</p>}
        {props.streaming ? <span aria-hidden="true" className={styles.caret} /> : null}
      </div>
    </div>
  );
}

function MarkdownToolbar(props: Readonly<{
  copyStatus: CopyStatus;
  disabled: boolean;
  onCopy?: () => Promise<void>;
  setCopyStatus: (status: CopyStatus) => void;
}>) {
  if (!props.onCopy) {
    return null;
  }
  return (
    <div className={styles.toolbar}>
      <button
        className={styles.copyButton}
        data-state={props.copyStatus}
        disabled={props.disabled}
        type="button"
        onClick={() => void copyGeneratedPrompt(props)}
      >
        {getCopyButtonLabel(props.copyStatus)}
      </button>
    </div>
  );
}

async function copyGeneratedPrompt(props: Readonly<{
  onCopy?: () => Promise<void>;
  setCopyStatus: (status: CopyStatus) => void;
}>) {
  try {
    await props.onCopy?.();
    props.setCopyStatus("success");
  } catch {
    props.setCopyStatus("error");
  }
}

function getCopyButtonLabel(status: CopyStatus) {
  if (status === "success") {
    return "已复制";
  }
  if (status === "error") {
    return "复制失败";
  }
  return "复制生成提示词";
}

function renderMarkdownBlock(block: PromptMarkdownBlock, index: number) {
  const key = `${block.type}-${index}`;
  if (block.type === "heading") {
    return renderHeading(block, key);
  }
  if (block.type === "unordered-list" || block.type === "ordered-list") {
    return renderList(block, key);
  }
  if (block.type === "code") {
    return renderCode(block, key);
  }
  if (block.type === "quote") {
    return <blockquote key={key}>{renderInlineMarkdown(block.text)}</blockquote>;
  }
  if (block.type === "rule") {
    return <hr key={key} />;
  }
  return <p key={key}>{renderInlineMarkdown(block.text)}</p>;
}

function renderHeading(block: Extract<PromptMarkdownBlock, { type: "heading" }>, key: string) {
  if (block.level === 1) {
    return <h2 key={key}>{renderInlineMarkdown(block.text)}</h2>;
  }
  if (block.level === 2) {
    return <h3 key={key}>{renderInlineMarkdown(block.text)}</h3>;
  }
  return <h4 key={key}>{renderInlineMarkdown(block.text)}</h4>;
}

function renderList(
  block: Extract<PromptMarkdownBlock, { type: "ordered-list" | "unordered-list" }>,
  key: string,
) {
  const items = block.items.map((item, index) => <li key={`${key}-${index}`}>{renderInlineMarkdown(item)}</li>);
  return block.type === "ordered-list" ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
}

function renderCode(block: Extract<PromptMarkdownBlock, { type: "code" }>, key: string) {
  return (
    <pre key={key}>
      <code data-language={block.language || undefined}>{block.code}</code>
    </pre>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => renderInlineMarkdownPart(part, index));
}

function renderInlineMarkdownPart(part: string, index: number): ReactNode {
  if (part.startsWith("`") && part.endsWith("`")) {
    return <code key={index}>{part.slice(1, -1)}</code>;
  }
  if (part.startsWith("**") && part.endsWith("**")) {
    return <strong key={index}>{part.slice(2, -2)}</strong>;
  }
  if (part.startsWith("*") && part.endsWith("*")) {
    return <em key={index}>{part.slice(1, -1)}</em>;
  }
  return part;
}
