"use client";

import { memo, useCallback, useRef, type ChangeEvent, type KeyboardEvent } from "react";

import { ASPECT_RATIO_OPTIONS, QUALITY_OPTIONS } from "@/features/studio/studio-options";
import {
  MAX_COUNT,
  MIN_COUNT,
  type ComposerMode,
  type StoredReferenceImage,
} from "@/features/studio/studio-types";
import type { PublicModelSummary } from "@/lib/public-api.types";
import type { ResourceState } from "@/lib/use-api-resource";
import styles from "./studio-composer.module.css";

type StudioComposerProps = Readonly<{
  mode: ComposerMode;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  count: number;
  referenceImages: readonly StoredReferenceImage[];
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  isSubmitting: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (model: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onResolutionChange: (resolution: string) => void;
  onQualityChange: (quality: string) => void;
  onCountChange: (count: number) => void;
  onReferenceImagesChange: (images: readonly StoredReferenceImage[]) => void;
  onSubmit: () => void;
  onOpenPromptMarket: () => void;
}>;

const MODE_OPTIONS: readonly { value: ComposerMode; label: string }[] = [
  { value: "generate", label: "生成" },
  { value: "edit", label: "编辑" },
  { value: "chat", label: "聊天" },
];

function getSubmitLabel(mode: ComposerMode, isSubmitting: boolean) {
  if (isSubmitting) return "处理中...";
  if (mode === "chat") return "发送";
  if (mode === "edit") return "编辑";
  return "生成";
}

export const StudioComposer = memo(function StudioComposer(props: StudioComposerProps) {
  const {
    mode,
    prompt,
    model,
    aspectRatio,
    resolution,
    quality,
    count,
    referenceImages,
    modelsState,
    isSubmitting,
    onModeChange,
    onPromptChange,
    onModelChange,
    onAspectRatioChange,
    onResolutionChange,
    onQualityChange,
    onCountChange,
    onReferenceImagesChange,
    onSubmit,
    onOpenPromptMarket,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!isSubmitting && prompt.trim()) {
          onSubmit();
        }
      }
    },
    [isSubmitting, onSubmit, prompt],
  );

  const handleTextareaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onPromptChange(event.target.value);
      const el = event.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
    },
    [onPromptChange],
  );

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;
      const newImages: StoredReferenceImage[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        newImages.push({ name: file.name, dataUrl, mimeType: file.type });
      }
      onReferenceImagesChange([...referenceImages, ...newImages]);
      if (mode !== "edit") onModeChange("edit");
      event.target.value = "";
    },
    [mode, onModeChange, onReferenceImagesChange, referenceImages],
  );

  const handleRemoveReference = useCallback(
    (index: number) => {
      const next = referenceImages.filter((_, i) => i !== index);
      onReferenceImagesChange(next);
      if (next.length === 0 && mode === "edit") onModeChange("generate");
    },
    [mode, onModeChange, onReferenceImagesChange, referenceImages],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      event.preventDefault();
      const newImages: StoredReferenceImage[] = [];
      for (const file of imageFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        newImages.push({ name: file.name || "pasted-image.png", dataUrl, mimeType: file.type });
      }
      onReferenceImagesChange([...referenceImages, ...newImages]);
      if (mode !== "edit") onModeChange("edit");
    },
    [mode, onModeChange, onReferenceImagesChange, referenceImages],
  );

  const activeRatio = ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio);
  const resolutions = activeRatio?.resolutions ?? [];
  const isDisabled = isSubmitting || !prompt.trim() || modelsState.status !== "ready";

  return (
    <div className={styles.composerDock}>
      <div className={styles.composerInner}>
        {referenceImages.length > 0 && (
          <div className={styles.referenceRow}>
            {referenceImages.map((img, index) => (
              <div key={img.name + index} className={styles.referenceWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.referenceThumb}
                  src={img.dataUrl || img.assetUrl || img.thumbnailUrl || ""}
                  alt={img.name}
                />
                <button
                  className={styles.referenceRemove}
                  type="button"
                  onClick={() => handleRemoveReference(index)}
                  aria-label={`移除 ${img.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className={styles.uploadButton}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="添加参考图"
            >
              +
            </button>
          </div>
        )}

        <div className={styles.promptRow}>
          <textarea
            className={styles.promptTextarea}
            placeholder={mode === "chat" ? "输入消息..." : "描述你想生成的图像..."}
            value={prompt}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
          />
          <button
            className={styles.submitButton}
            type="button"
            disabled={isDisabled}
            onClick={onSubmit}
          >
            {isSubmitting && <span className={styles.spinner} />}
            {getSubmitLabel(mode, isSubmitting)}
          </button>
        </div>

        <div className={styles.settingsRow}>
          <div className={styles.modeToggle}>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`${styles.modeButton} ${mode === opt.value ? styles.modeButtonActive : ""}`}
                type="button"
                onClick={() => onModeChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode !== "chat" && (
            <>
              <select
                className={styles.settingSelect}
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={modelsState.status !== "ready"}
              >
                {modelsState.status === "ready"
                  ? modelsState.data.map((m) => (
                      <option key={m.id} value={m.code}>{m.display_name}</option>
                    ))
                  : <option value="">加载中...</option>
                }
              </select>

              <select
                className={styles.settingSelect}
                value={aspectRatio}
                onChange={(e) => onAspectRatioChange(e.target.value)}
              >
                {ASPECT_RATIO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {resolutions.length > 0 && (
                <select
                  className={styles.settingSelect}
                  value={resolution}
                  onChange={(e) => onResolutionChange(e.target.value)}
                >
                  {resolutions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              )}

              <select
                className={styles.settingSelect}
                value={quality}
                onChange={(e) => onQualityChange(e.target.value)}
              >
                {QUALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <div className={styles.countControl}>
                <button
                  className={styles.countButton}
                  type="button"
                  onClick={() => onCountChange(Math.max(MIN_COUNT, count - 1))}
                  disabled={count <= MIN_COUNT}
                >
                  −
                </button>
                <span className={styles.countValue}>{count}</span>
                <button
                  className={styles.countButton}
                  type="button"
                  onClick={() => onCountChange(Math.min(MAX_COUNT, count + 1))}
                  disabled={count >= MAX_COUNT}
                >
                  +
                </button>
              </div>
            </>
          )}

          <button
            className={styles.marketButton}
            type="button"
            onClick={onOpenPromptMarket}
          >
            模板
          </button>

          {mode !== "chat" && referenceImages.length === 0 && (
            <button
              className={styles.uploadButton}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="上传参考图"
              style={{ width: "2rem", height: "2rem" }}
            >
              +
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleFileSelect}
      />
    </div>
  );
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}