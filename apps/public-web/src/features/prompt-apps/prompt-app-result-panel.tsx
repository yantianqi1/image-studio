/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

import { ResultActionBar } from "@/features/home/generation-result-actions";
import { ImagePreviewDialog, type ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";

import type { PromptImageGenerateImage, PromptImageGenerateState } from "./prompt-image-generate-app";
import styles from "./prompt-apps.module.css";

export function PromptAppResultPanel(props: Readonly<{
  altPrefix: string;
  state: PromptImageGenerateState;
}>) {
  const [previewImage, setPreviewImage] = useState<ImagePreviewDialogImage | null>(null);
  const resultStageClassName = props.state.status === "success"
    ? `${styles.resultStage} ${styles.resultStagePreview}`
    : styles.resultStage;

  return (
    <aside className={styles.posterResult}>
      <div className={resultStageClassName}>
        <span className={styles.resultLabel}>{getResultLabel(props.state)}</span>
        {props.state.status === "idle" ? <p>填写左侧表单后，结果会显示在这里。</p> : null}
        {props.state.status === "submitting" ? <p>任务已提交，正在等待图片结果。</p> : null}
        {props.state.status === "error" ? <p className={styles.errorText}>{props.state.message}</p> : null}
        {props.state.status === "success" ? (
          <PromptAppImageGrid
            altPrefix={props.altPrefix}
            images={props.state.images}
            jobId={props.state.jobId}
            onPreview={setPreviewImage}
          />
        ) : null}
      </div>
      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </aside>
  );
}

function PromptAppImageGrid(props: Readonly<{
  altPrefix: string;
  images: readonly PromptImageGenerateImage[];
  jobId: number;
  onPreview: (image: ImagePreviewDialogImage) => void;
}>) {
  const gridClassName = props.images.length === 1
    ? `${styles.posterImageGrid} ${styles.posterImageGridSingle}`
    : styles.posterImageGrid;

  return (
    <div className={gridClassName}>
      {props.images.map((image) => {
        const alt = `${props.altPrefix}生成结果 ${props.jobId}-${image.id}`;
        return (
          <figure className={styles.posterImageCard} key={image.id}>
            <button
              className={styles.posterImageButton}
              type="button"
              onClick={() => props.onPreview({ src: image.url, alt })}
            >
              <img alt={alt} src={image.url} />
            </button>
            <ResultActionBar hasImages image={image} imageUrl={image.url} layout="card" />
          </figure>
        );
      })}
    </div>
  );
}

function getResultLabel(state: PromptImageGenerateState) {
  if (state.status === "submitting") {
    return "生成中";
  }
  if (state.status === "error") {
    return "生成失败";
  }
  if (state.status === "success") {
    return "生成完成";
  }
  return "待生成";
}
