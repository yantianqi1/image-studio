/* eslint-disable @next/next/no-img-element */
"use client";

import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";
import { getGenerationSourceImagePreviewUrl } from "@/features/home/generation-source-images";
import styles from "./generation-prompt-image-upload.module.css";

type PromptImageUploadProps = Readonly<{
  referenceImages: readonly GenerationSourceImage[];
  uploadState: SourceUploadState;
  onClear: () => void;
  onRemove: (index: number) => void;
  onUpload: (files: readonly File[]) => Promise<void> | void;
}>;

export function GenerationPromptImageUpload({
  referenceImages,
  uploadState,
  onClear,
  onRemove,
  onUpload,
}: PromptImageUploadProps) {
  const isUploading = uploadState.status === "uploading";

  return (
    <div className={styles.uploadBar}>
      <div className={styles.uploadCopy}>
        <span className={styles.uploadTitle}>图生图 / 图片编辑</span>
        <span className={styles.uploadText}>上传一张或多张参考图后，提交任务会进入图片编辑模式。</span>
      </div>
      <div className={styles.uploadActionGroup}>
        <ReferenceThumbs referenceImages={referenceImages} onRemove={onRemove} />
        {referenceImages.length > 0 ? <ClearButton onClear={onClear} /> : null}
        <UploadButton disabled={isUploading} uploadState={uploadState} onUpload={onUpload} />
      </div>
    </div>
  );
}

function ReferenceThumbs({
  referenceImages,
  onRemove,
}: Readonly<{ referenceImages: readonly GenerationSourceImage[]; onRemove: (index: number) => void }>) {
  if (referenceImages.length === 0) {
    return null;
  }

  return (
    <div className={styles.referenceList}>
      {referenceImages.map((image, index) => (
        <ReferenceThumb
          key={`${image.assetId}-${index}`}
          image={image}
          index={index}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function ReferenceThumb({
  image,
  index,
  onRemove,
}: Readonly<{ image: GenerationSourceImage; index: number; onRemove: (index: number) => void }>) {
  return (
    <div className={styles.sourceThumb}>
      <img
        src={getGenerationSourceImagePreviewUrl(image)}
        alt="图片编辑参考图"
        loading="lazy"
        decoding="async"
      />
      <button type="button" onClick={() => onRemove(index)} aria-label="移除参考图">×</button>
    </div>
  );
}

function ClearButton({ onClear }: Readonly<{ onClear: () => void }>) {
  return (
    <button className={styles.clearAllButton} type="button" onClick={onClear}>
      清空
    </button>
  );
}

function UploadButton({
  disabled,
  uploadState,
  onUpload,
}: Readonly<{
  disabled: boolean;
  uploadState: SourceUploadState;
  onUpload: (files: readonly File[]) => Promise<void> | void;
}>) {
  return (
    <label className={styles.iconButton} aria-label="上传图片">
      <input
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        multiple
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

function handleFileChange(
  input: HTMLInputElement,
  onUpload: (files: readonly File[]) => Promise<void> | void,
) {
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (files.length === 0) {
    return;
  }
  void onUpload(files);
}
