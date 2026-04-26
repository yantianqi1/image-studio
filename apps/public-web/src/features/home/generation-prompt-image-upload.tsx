/* eslint-disable @next/next/no-img-element */
"use client";

import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";
import styles from "./generation-prompt-image-upload.module.css";

type PromptImageUploadProps = Readonly<{
  sourceImage: GenerationSourceImage | null;
  uploadState: SourceUploadState;
  onClear: () => void;
  onUpload: (file: File) => Promise<void> | void;
}>;

export function GenerationPromptImageUpload({
  sourceImage,
  uploadState,
  onClear,
  onUpload,
}: PromptImageUploadProps) {
  const isUploading = uploadState.status === "uploading";

  return (
    <div className={styles.uploadBar}>
      <div className={styles.uploadCopy}>
        <span className={styles.uploadTitle}>图生图 / 图片编辑</span>
        <span className={styles.uploadText}>上传源图后，提交任务会进入图片编辑模式。</span>
      </div>
      <div className={styles.uploadActionGroup}>
        {sourceImage ? <SourceThumb sourceImage={sourceImage} onClear={onClear} /> : null}
        <UploadButton disabled={isUploading} uploadState={uploadState} onUpload={onUpload} />
      </div>
    </div>
  );
}

function SourceThumb({
  sourceImage,
  onClear,
}: Readonly<{ sourceImage: GenerationSourceImage; onClear: () => void }>) {
  return (
    <div className={styles.sourceThumb}>
      <img src={sourceImage.assetUrl} alt="图片编辑源图" />
      <button type="button" onClick={onClear} aria-label="移除编辑源图">×</button>
    </div>
  );
}

function UploadButton({
  disabled,
  uploadState,
  onUpload,
}: Readonly<{
  disabled: boolean;
  uploadState: SourceUploadState;
  onUpload: (file: File) => Promise<void> | void;
}>) {
  return (
    <label className={styles.iconButton} aria-label="上传图片">
      <input
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        type="file"
        onChange={(event) => handleFileChange(event.currentTarget, onUpload)}
      />
      {uploadState.status === "uploading" ? "…" : <ImageIcon />}
    </label>
  );
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m7.5 16 3-3a1 1 0 0 1 1.42.02l1.05 1.08a1 1 0 0 0 1.43 0L16 12.5l2.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M8.8 9h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.8" />
    </svg>
  );
}

function handleFileChange(input: HTMLInputElement, onUpload: (file: File) => Promise<void> | void) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  void onUpload(file);
}
