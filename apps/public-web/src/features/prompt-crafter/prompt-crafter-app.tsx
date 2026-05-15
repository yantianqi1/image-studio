"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { AppShell } from "@/features/shell/app-shell";
import {
  streamPromptCrafter,
  type PromptCrafterMessage,
} from "./prompt-crafter-api";
import { extractPromptOptionsFromMarkdown } from "./prompt-markdown";
import { PromptMarkdownView } from "./prompt-markdown-view";
import { applyPromptToGenerate } from "./use-prompt";
import styles from "./prompt-crafter.module.css";

const REFINEMENT_PROMPT = "请基于上一版结果继续优化，保留核心主题，强化镜头、构图、材质、光线和可读性，并继续输出三套严格 Markdown 备选提示词。";

const STARTERS: readonly string[] = [
  "成年亚洲女性，清纯自然脸，雨后街道，电影感人像写真",
  "高端咖啡包装主视觉，深绿色罐体，铜金标签，桌面广告摄影",
  "城市文化宣传海报，国潮视觉，竖版构图，中文标题清晰可读",
];

type PromptCrafterStatus = "idle" | "streaming" | "error";

export function PromptCrafterApp() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly PromptCrafterMessage[]>([]);
  const [status, setStatus] = useState<PromptCrafterStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyLabel, setCopyLabel] = useState("复制");
  const abortRef = useRef<AbortController | null>(null);

  const latestPrompt = useMemo(() => readLatestAssistantPrompt(messages), [messages]);
  const firstUsablePrompt = useMemo(() => readFirstUsablePrompt(latestPrompt), [latestPrompt]);
  const canSubmit = draft.trim().length > 0 && status !== "streaming";
  const canContinue = Boolean(latestPrompt) && status !== "streaming";

  const submitPrompt = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || status === "streaming") return;
    const nextMessages: PromptCrafterMessage[] = [...messages, { role: "user", content: trimmed }];
    setDraft("");
    setErrorMessage("");
    setStatus("streaming");
    setCopyLabel("复制");
    await runPromptCrafterStream({ abortRef, nextMessages, setErrorMessage, setMessages, setStatus });
  }, [messages, status]);

  const handleCopy = useCallback(async () => {
    if (!latestPrompt) return;
    await navigator.clipboard.writeText(latestPrompt);
    setCopyLabel("已复制");
  }, [latestPrompt]);

  const handleUsePrompt = useCallback((prompt: string) => {
    applyPromptToGenerate(prompt);
  }, []);

  return (
    <AppShell
      activeHref="/apps"
      headerTitle="提示词工坊"
      leadingAction={<Link aria-label="返回应用中心" className={styles.backLink} href="/apps">←</Link>}
    >
      <div className={styles.workspace}>
        <section className={styles.inputPanel}>
          <h1 className={styles.title}>提示词工坊</h1>
          <div className={styles.starters}>
            {STARTERS.map((starter) => (
              <button className={styles.starterButton} key={starter} type="button" onClick={() => setDraft(starter)}>
                {starter}
              </button>
            ))}
          </div>
          <form className={styles.form} onSubmit={(event) => {
            event.preventDefault();
            void submitPrompt(draft);
          }}>
            <textarea
              className={styles.textarea}
              placeholder="写下你想生成的画面、用途、主体或风格"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className={styles.actions}>
              <button className={styles.primaryButton} disabled={!canSubmit} type="submit">
                {status === "streaming" ? "生成中..." : "生成提示词"}
              </button>
              <button className={styles.secondaryButton} disabled={!canContinue} type="button" onClick={() => void submitPrompt(REFINEMENT_PROMPT)}>
                继续优化
              </button>
            </div>
          </form>
          {status === "error" ? <p className={styles.errorText}>{errorMessage}</p> : null}
        </section>
        <section className={styles.outputPanel}>
          <div className={styles.outputHeader}>
            <span className={styles.outputLabel}>Markdown</span>
            <div className={styles.outputActions}>
              <button className={styles.secondaryButton} disabled={!latestPrompt} type="button" onClick={() => void handleCopy()}>
                {copyLabel}
              </button>
              <button className={styles.primarySmallButton} disabled={!firstUsablePrompt} type="button" onClick={() => handleUsePrompt(firstUsablePrompt)}>
                发送到生图
              </button>
            </div>
          </div>
          <PromptMarkdownView
            markdown={latestPrompt}
            onCopy={handleCopy}
            onUsePrompt={handleUsePrompt}
            streaming={status === "streaming"}
          />
        </section>
      </div>
    </AppShell>
  );
}

function readLatestAssistantPrompt(messages: readonly PromptCrafterMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content.trim() ?? "";
}

function readFirstUsablePrompt(markdown: string): string {
  return extractPromptOptionsFromMarkdown(markdown)[0]?.prompt ?? markdown.trim();
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
