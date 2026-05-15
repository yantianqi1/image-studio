"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MutableRefObject } from "react";
import { FolderOpen, ImagePlus } from "lucide-react";

import { AppShell } from "@/features/shell/app-shell";
import { publicApi } from "@/lib/public-api";
import {
  streamPromptCrafter,
  streamPromptCrafterReverseImage,
  type PromptCrafterMessage,
} from "./prompt-crafter-api";
import { extractPromptOptionsFromMarkdown } from "./prompt-markdown";
import { PromptMarkdownView } from "./prompt-markdown-view";
import { applyPromptToGenerate } from "./use-prompt";
import styles from "./prompt-crafter.module.css";

const REFINEMENT_PROMPT = "请基于上一版结果继续优化，保留核心主题，强化镜头、构图、材质、光线和可读性，并继续输出三套严格 Markdown 备选提示词。";
const REVERSE_IMAGE_USER_PREFIX = "图片反推提示词";
const FOLDER_INPUT_DIRECTORY_PROPS = { webkitdirectory: "" } as Record<string, string>;

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
  const [reverseFiles, setReverseFiles] = useState<readonly File[]>([]);
  const [reverseNote, setReverseNote] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const latestPrompt = useMemo(() => readLatestAssistantPrompt(messages), [messages]);
  const firstUsablePrompt = useMemo(() => readFirstUsablePrompt(latestPrompt), [latestPrompt]);
  const canSubmit = draft.trim().length > 0 && status !== "streaming";
  const canContinue = Boolean(latestPrompt) && status !== "streaming";
  const canReverse = reverseFiles.length > 0 && status !== "streaming";

  const submitPrompt = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || status === "streaming") return;
    const nextMessages: PromptCrafterMessage[] = [...messages, { role: "user", content: trimmed }];
    setDraft("");
    setErrorMessage("");
    setStatus("streaming");
    setCopyLabel("复制");
    await runAssistantStream({
      abortRef,
      nextMessages,
      setErrorMessage,
      setMessages,
      setStatus,
      stream: ({ signal, onChunk }) => streamPromptCrafter({ messages: nextMessages, signal, onChunk }),
    });
  }, [messages, status]);

  const handleReverseImageFiles = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    try {
      setReverseFiles(resolveReverseImageFiles(event.currentTarget.files));
      setErrorMessage("");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "图片选择失败");
      setStatus("error");
    } finally {
      event.currentTarget.value = "";
    }
  }, []);

  const submitReverseImages = useCallback(async () => {
    if (status === "streaming") return;
    if (reverseFiles.length === 0) {
      setErrorMessage("请选择需要反推的图片");
      setStatus("error");
      return;
    }
    const nextMessages = buildReverseImageMessages({ files: reverseFiles, note: reverseNote });
    setErrorMessage("");
    setStatus("streaming");
    setCopyLabel("复制");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    try {
      const assets = await Promise.all(reverseFiles.map((file) => publicApi.uploadImageAsset(file)));
      await runAssistantStream({
        abortRef,
        nextMessages,
        setErrorMessage,
        setMessages,
        setStatus,
        stream: ({ signal, onChunk }) => streamPromptCrafterReverseImage({
          assetIds: assets.map((asset) => asset.id),
          note: reverseNote,
          signal,
          onChunk,
        }),
      });
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "图片反推失败");
      setStatus("error");
    }
  }, [reverseFiles, reverseNote, status]);

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
          <div className={styles.reverseBox}>
            <div className={styles.reverseHeader}>
              <span className={styles.reverseTitle}>图片反推</span>
              <span className={styles.reverseMeta}>{reverseFiles.length > 0 ? `${reverseFiles.length} 张` : "未选择"}</span>
            </div>
            <textarea
              className={styles.noteInput}
              placeholder="可选：补充希望重点保留的主体、材质、文字或风格"
              value={reverseNote}
              onChange={(event) => setReverseNote(event.target.value)}
            />
            <div className={styles.actions}>
              <button className={styles.secondaryButton} type="button" onClick={() => imageInputRef.current?.click()}>
                <ImagePlus aria-hidden="true" size={16} />
                上传图片
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => folderInputRef.current?.click()}>
                <FolderOpen aria-hidden="true" size={16} />
                打开文件夹
              </button>
              <button className={styles.primaryButton} disabled={!canReverse} type="button" onClick={() => void submitReverseImages()}>
                {status === "streaming" ? "反推中..." : "反推提示词"}
              </button>
            </div>
            <input
              ref={imageInputRef}
              className={styles.hiddenInput}
              type="file"
              accept="image/*"
              multiple
              onChange={handleReverseImageFiles}
            />
            <input
              ref={folderInputRef}
              className={styles.hiddenInput}
              type="file"
              accept="image/*"
              multiple
              {...FOLDER_INPUT_DIRECTORY_PROPS}
              onChange={handleReverseImageFiles}
            />
            {reverseFiles.length > 0 ? <p className={styles.fileSummary}>{summarizeReverseFiles(reverseFiles)}</p> : null}
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

function resolveReverseImageFiles(fileList: FileList | null): readonly File[] {
  const files = Array.from(fileList ?? []);
  const invalidFile = files.find((file) => !file.type.startsWith("image/"));
  if (invalidFile) {
    throw new Error(`${invalidFile.name} 不是图片文件`);
  }
  return files;
}

function buildReverseImageMessages(input: Readonly<{ files: readonly File[]; note: string }>): readonly PromptCrafterMessage[] {
  const names = input.files.map((file) => file.name).join("、");
  const note = input.note.trim() ? `\n补充要求：${input.note.trim()}` : "";
  return [{ role: "user", content: `${REVERSE_IMAGE_USER_PREFIX}：${names}${note}` }];
}

function summarizeReverseFiles(files: readonly File[]): string {
  const names = files.slice(0, 3).map((file) => file.name).join("、");
  return files.length > 3 ? `${names} 等 ${files.length} 张图片` : names;
}

async function runAssistantStream(input: Readonly<{
  abortRef: MutableRefObject<AbortController | null>;
  nextMessages: readonly PromptCrafterMessage[];
  setErrorMessage: (message: string) => void;
  setMessages: (messages: readonly PromptCrafterMessage[]) => void;
  setStatus: (status: PromptCrafterStatus) => void;
  stream: (input: Readonly<{ signal: AbortSignal; onChunk: (chunk: string) => void }>) => Promise<void>;
}>) {
  let assistantContent = "";
  const abortController = new AbortController();
  input.abortRef.current = abortController;
  input.setMessages([...input.nextMessages, { role: "assistant", content: assistantContent }]);
  try {
    await input.stream({
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
