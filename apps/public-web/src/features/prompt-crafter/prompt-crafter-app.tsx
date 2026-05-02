"use client";

import Link from "next/link";
import type { FormEvent, MutableRefObject } from "react";
import { useMemo, useRef, useState } from "react";

import { AppShell } from "@/features/shell/app-shell";

import {
  type PromptCrafterMessage,
  streamPromptCrafter,
} from "./prompt-crafter-api";
import { PromptMarkdownView } from "./prompt-markdown-view";
import styles from "./prompt-crafter.module.css";

const REFINEMENT_PROMPT = "请基于上一版结果继续优化，保留核心主题，强化镜头、构图、材质、光线和可读性。";

const PROMPT_STARTERS: readonly Readonly<{ label: string; value: string }>[] = [
  { label: "人像写真", value: "成年亚洲女性，清纯自然脸，雨后街道，电影感人像写真" },
  { label: "产品视觉", value: "高端咖啡包装主视觉，深绿色罐体，铜金标签，桌面广告摄影" },
  { label: "海报设计", value: "城市文化宣传海报，国潮视觉，竖版构图，中文标题清晰可读" },
  { label: "信息图", value: "猫咪品种科普信息图，模块化排版，图鉴感，浅色背景" },
  { label: "图像编辑", value: "基于参考图，只替换服装与背景，保留人物身份、脸部和原始光线" },
];

type PromptCrafterStatus = "idle" | "streaming" | "error";
type PromptCrafterCopyStatus = "idle" | "success" | "error";

type PromptCrafterController = Readonly<{
  draft: string;
  errorMessage: string;
  copyStatus: PromptCrafterCopyStatus;
  generateHref: string;
  latestPrompt: string;
  messages: readonly PromptCrafterMessage[];
  status: PromptCrafterStatus;
  canContinue: boolean;
  handleContinueOptimization: () => void;
  handleCopy: () => Promise<void>;
  handleStarterClick: (value: string) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setDraft: (value: string) => void;
}>;

export function PromptCrafterApp() {
  const controller = usePromptCrafterController();

  return (
    <AppShell activeHref="/apps" headerTitle="提示词工坊" leadingAction={<PromptCrafterBackLink />} workspaceMode>
      <div className={styles.workspace}>
        <PromptCrafterInputPanel controller={controller} />
        <PromptCrafterResultPanel controller={controller} />
      </div>
    </AppShell>
  );
}

function PromptCrafterBackLink() {
  return (
    <Link aria-label="返回应用中心" className={styles.backLink} href="/apps">
      <span aria-hidden="true">←</span>
      <span>返回</span>
    </Link>
  );
}

function usePromptCrafterController(): PromptCrafterController {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly PromptCrafterMessage[]>([]);
  const [status, setStatus] = useState<PromptCrafterStatus>("idle");
  const [copyStatus, setCopyStatus] = useState<PromptCrafterCopyStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const latestPrompt = useMemo(() => findLatestAssistantMessage(messages), [messages]);
  const generateHref = `/generate?prompt=${encodeURIComponent(latestPrompt)}`;

  async function submitPrompt(content: string) {
    const trimmed = content.trim();
    if (!trimmed || status === "streaming") {
      return;
    }
    const nextMessages = [...messages, { role: "user", content: trimmed } satisfies PromptCrafterMessage];
    setDraft("");
    setCopyStatus("idle");
    setErrorMessage("");
    setStatus("streaming");
    await runPromptCrafterStream({ abortRef, nextMessages, setErrorMessage, setMessages, setStatus });
  }

  return {
    draft,
    errorMessage,
    copyStatus,
    generateHref,
    latestPrompt,
    messages,
    status,
    canContinue: Boolean(latestPrompt) && status !== "streaming",
    handleContinueOptimization: () => void submitPrompt(REFINEMENT_PROMPT),
    handleCopy: () => copyLatestPrompt(latestPrompt, setCopyStatus),
    handleStarterClick: setDraft,
    handleSubmit: async (event) => {
      event.preventDefault();
      await submitPrompt(draft);
    },
    setDraft,
  };
}

async function runPromptCrafterStream(input: Readonly<{
  abortRef: MutableRefObject<AbortController | null>;
  nextMessages: readonly PromptCrafterMessage[];
  setErrorMessage: (message: string) => void;
  setMessages: (messages: readonly PromptCrafterMessage[]) => void;
  setStatus: (status: PromptCrafterStatus) => void;
}>) {
  let assistantContent = "";
  const abortController = new AbortController();
  input.abortRef.current = abortController;
  input.setMessages([...input.nextMessages, { role: "assistant", content: assistantContent }]);
  try {
    await streamPromptCrafter({
      messages: input.nextMessages,
      signal: abortController.signal,
      onChunk: (chunk) => {
        assistantContent += chunk;
        input.setMessages([...input.nextMessages, { role: "assistant", content: assistantContent }]);
      },
    });
    input.setStatus("idle");
  } catch (error: unknown) {
    input.setErrorMessage(error instanceof Error ? error.message : "提示词生成失败");
    input.setStatus("error");
  } finally {
    input.abortRef.current = null;
  }
}

async function copyLatestPrompt(latestPrompt: string, setCopyStatus: (value: PromptCrafterCopyStatus) => void) {
  if (!latestPrompt) {
    return;
  }
  try {
    await copyPromptToClipboard(latestPrompt);
    setCopyStatus("success");
  } catch {
    setCopyStatus("error");
  }
}

async function copyPromptToClipboard(prompt: string) {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable.");
  }
  await navigator.clipboard.writeText(prompt.trim());
}

function findLatestAssistantMessage(messages: readonly PromptCrafterMessage[]) {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content.trim() ?? "";
}

function PromptCrafterInputPanel(props: Readonly<{ controller: PromptCrafterController }>) {
  const disabled = props.controller.status === "streaming" || !props.controller.draft.trim();

  return (
    <section className={styles.inputPanel}>
      <div className={styles.panelHeader}>
        <span className={styles.statusBadge}>Skill Stream</span>
        <h1 className={styles.heading}>提示词工坊</h1>
      </div>
      <StarterGrid onSelect={props.controller.handleStarterClick} />
      <form className={styles.form} onSubmit={props.controller.handleSubmit}>
        <label className={styles.fieldGroup}>
          <span>需求草稿</span>
          <textarea
            className={styles.ideaInput}
            placeholder="例如：做一张高级咖啡包装海报，想要更有质感、适合 GPT-image-2"
            value={props.controller.draft}
            onChange={(event) => props.controller.setDraft(event.target.value)}
          />
        </label>
        <div className={styles.inputActions}>
          <button className={styles.primaryButton} disabled={disabled} type="submit">
            {props.controller.status === "streaming" ? "生成中" : "生成提示词"}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={!props.controller.canContinue}
            type="button"
            onClick={props.controller.handleContinueOptimization}
          >
            继续优化
          </button>
        </div>
        {props.controller.status === "error" ? <p className={styles.errorText}>{props.controller.errorMessage}</p> : null}
      </form>
    </section>
  );
}

function StarterGrid(props: Readonly<{ onSelect: (value: string) => void }>) {
  return (
    <div className={styles.starterGrid} aria-label="提示词类型">
      {PROMPT_STARTERS.map((starter) => (
        <button className={styles.starterButton} key={starter.label} type="button" onClick={() => props.onSelect(starter.value)}>
          {starter.label}
        </button>
      ))}
    </div>
  );
}

function PromptCrafterResultPanel(props: Readonly<{ controller: PromptCrafterController }>) {
  const hasPrompt = Boolean(props.controller.latestPrompt);

  return (
    <section className={styles.resultPanel}>
      <div className={styles.resultHeader}>
        <span className={styles.resultLabel}>{props.controller.status === "streaming" ? "Streaming" : "Prompt"}</span>
        <div className={styles.resultActions}>
          <button className={styles.textButton} disabled={!hasPrompt} type="button" onClick={props.controller.handleCopy}>
            {props.controller.copyStatus === "success" ? "已复制" : props.controller.copyStatus === "error" ? "复制失败" : "复制"}
          </button>
          <Link className={hasPrompt ? styles.textButtonLink : styles.textButtonLinkDisabled} href={props.controller.generateHref}>
            发送到生图
          </Link>
        </div>
      </div>
      <MessageList isStreaming={props.controller.status === "streaming"} messages={props.controller.messages} />
    </section>
  );
}

function MessageList(props: Readonly<{ isStreaming: boolean; messages: readonly PromptCrafterMessage[] }>) {
  if (props.messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span>等待输入</span>
      </div>
    );
  }

  return (
    <div className={styles.messageList}>
      {props.messages.map((message, index) => (
        <MessageBubble
          index={index}
          isStreaming={props.isStreaming && index === props.messages.length - 1}
          key={`${message.role}-${index}`}
          message={message}
        />
      ))}
    </div>
  );
}

function MessageBubble(props: Readonly<{ index: number; isStreaming: boolean; message: PromptCrafterMessage }>) {
  const isAssistant = props.message.role === "assistant";
  const className = isAssistant ? `${styles.message} ${styles.assistantMessage}` : `${styles.message} ${styles.userMessage}`;

  return (
    <article className={className}>
      <span className={styles.messageMeta}>{isAssistant ? "Prompt Crafter" : `需求 ${props.index + 1}`}</span>
      {isAssistant ? (
        <PromptMarkdownView
          markdown={props.message.content}
          streaming={props.isStreaming}
          onCopy={() => copyPromptToClipboard(props.message.content)}
        />
      ) : (
        <p className={styles.userText}>{props.message.content || "..."}</p>
      )}
    </article>
  );
}
