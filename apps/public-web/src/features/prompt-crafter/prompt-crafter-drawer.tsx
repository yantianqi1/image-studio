"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { RefreshCw } from "lucide-react";

import {
  type PromptCrafterMessage,
  streamPromptCrafter,
} from "./prompt-crafter-api";
import { extractPromptOptionsFromMarkdown } from "./prompt-markdown";
import { PromptMarkdownView } from "./prompt-markdown-view";
import {
  buildPromptCrafterRefreshMessages,
  readPromptCrafterSession,
  savePromptCrafterSession,
} from "./prompt-crafter-session";
import { applyPromptToGenerate } from "./use-prompt";
import styles from "./prompt-crafter-drawer.module.css";

const REFINEMENT_PROMPT = "请基于上一版结果继续优化，保留核心主题，强化镜头、构图、材质、光线和可读性。";

const PROMPT_STARTERS: readonly Readonly<{ label: string; value: string }>[] = [
  { label: "人像写真", value: "成年亚洲女性，清纯自然脸，雨后街道，电影感人像写真" },
  { label: "产品视觉", value: "高端咖啡包装主视觉，深绿色罐体，铜金标签，桌面广告摄影" },
  { label: "海报设计", value: "城市文化宣传海报，国潮视觉，竖版构图，中文标题清晰可读" },
  { label: "信息图", value: "猫咪品种科普信息图，模块化排版，图鉴感，浅色背景" },
];

type DrawerStatus = "idle" | "streaming" | "error";

export function PromptCrafterDrawer({ onClose }: Readonly<{ onClose: () => void }>) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly PromptCrafterMessage[]>([]);
  const [status, setStatus] = useState<DrawerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyLabel, setCopyLabel] = useState("复制");
  const [closing, setClosing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [reverseNote, setReverseNote] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const latestPrompt = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.content.trim() ?? "",
    [messages],
  );
  const firstUsablePrompt = useMemo(() => readFirstUsablePrompt(latestPrompt), [latestPrompt]);
  const canSubmit = draft.trim().length > 0 && status !== "streaming";
  const canContinue = Boolean(latestPrompt) && status !== "streaming";
  const canRefresh = messages.some((message) => message.role === "user") && status !== "streaming";

  useEffect(() => {
    const session = readPromptCrafterSession();
    setDraft(session.draft);
    setMessages(session.messages);
    setReverseNote(session.reverseNote);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePromptCrafterSession({ draft, messages, reverseNote });
  }, [draft, hydrated, messages, reverseNote]);

  const submitPrompt = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || status === "streaming") return;
    const nextMessages: PromptCrafterMessage[] = [...messages, { role: "user", content: trimmed }];
    setDraft("");
    setErrorMessage("");
    setStatus("streaming");
    setCopyLabel("复制");
    await runStream({ abortRef, nextMessages, setErrorMessage, setMessages, setStatus });
  }, [messages, status]);

  const refreshPrompt = useCallback(async () => {
    if (status === "streaming") return;
    try {
      const nextMessages = buildPromptCrafterRefreshMessages(messages);
      setErrorMessage("");
      setStatus("streaming");
      setCopyLabel("复制");
      await runStream({ abortRef, nextMessages, setErrorMessage, setMessages, setStatus });
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "提示词刷新失败");
      setStatus("error");
    }
  }, [messages, status]);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPrompt(draft);
  }, [draft, submitPrompt]);

  const handleCopy = useCallback(async () => {
    if (!latestPrompt) return;
    try {
      await navigator.clipboard.writeText(latestPrompt);
      setCopyLabel("已复制");
    } catch {
      setCopyLabel("失败");
    }
  }, [latestPrompt]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 220);
  }, [onClose]);

  const handleUsePrompt = useCallback((nextPrompt: string) => {
    applyPromptToGenerate(nextPrompt);
    handleClose();
  }, [handleClose]);

  const handleUseFirstPrompt = useCallback(() => {
    if (firstUsablePrompt) {
      handleUsePrompt(firstUsablePrompt);
    }
  }, [firstUsablePrompt, handleUsePrompt]);

  return (
    <>
      <div className={closing ? `${styles.overlay} ${styles.overlayClosing}` : styles.overlay} onClick={handleClose} />
      <aside className={closing ? `${styles.drawer} ${styles.drawerClosing}` : styles.drawer} aria-label="提示词工坊">
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>提示词工坊</h2>
          <button aria-label="关闭" className={styles.closeButton} type="button" onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className={styles.drawerBody}>
          <StarterGrid onSelect={setDraft} />
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.fieldLabel}>
              <span>需求草稿</span>
              <textarea
                className={styles.textarea}
                placeholder="例如：做一张高级咖啡包装海报，想要更有质感"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <div className={styles.actions}>
              <button className={styles.primaryButton} disabled={!canSubmit} type="submit">
                {status === "streaming" ? "生成中..." : "生成提示词"}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={!canContinue}
                type="button"
                onClick={() => void submitPrompt(REFINEMENT_PROMPT)}
              >
                优化
              </button>
              <button
                className={styles.secondaryButton}
                disabled={!canRefresh}
                type="button"
                onClick={() => void refreshPrompt()}
              >
                <RefreshCw aria-hidden="true" size={15} />
                刷新
              </button>
            </div>
            {status === "error" ? <p className={styles.errorText}>{errorMessage}</p> : null}
          </form>
          <div className={styles.resultSection}>
            <div className={styles.resultHeader}>
              <span className={styles.resultLabel}>
                {status === "streaming" ? "Streaming" : "Prompt"}
              </span>
              <div className={styles.resultActions}>
                <button
                  className={styles.resultActionButton}
                  disabled={!latestPrompt}
                  type="button"
                  onClick={handleCopy}
                >
                  {copyLabel}
                </button>
                <button
                  className={styles.resultActionButton}
                  disabled={!firstUsablePrompt}
                  type="button"
                  onClick={handleUseFirstPrompt}
                >
                  发送到生图
                </button>
              </div>
            </div>
            <div className={styles.resultBody}>
              {latestPrompt || status === "streaming" ? (
                <PromptMarkdownView
                  markdown={latestPrompt}
                  streaming={status === "streaming"}
                  onCopy={handleCopy}
                  onUsePrompt={handleUsePrompt}
                />
              ) : (
                <div className={styles.emptyResult}>
                  <span>等待输入</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function readFirstUsablePrompt(markdown: string): string {
  return extractPromptOptionsFromMarkdown(markdown)[0]?.prompt ?? markdown.trim();
}

function StarterGrid({ onSelect }: Readonly<{ onSelect: (value: string) => void }>) {
  return (
    <div className={styles.starterGrid} aria-label="提示词类型">
      {PROMPT_STARTERS.map((starter) => (
        <button
          className={styles.starterButton}
          key={starter.label}
          type="button"
          onClick={() => onSelect(starter.value)}
        >
          {starter.label}
        </button>
      ))}
    </div>
  );
}

async function runStream(input: Readonly<{
  abortRef: MutableRefObject<AbortController | null>;
  nextMessages: readonly PromptCrafterMessage[];
  setErrorMessage: (message: string) => void;
  setMessages: (messages: readonly PromptCrafterMessage[]) => void;
  setStatus: (status: DrawerStatus) => void;
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
