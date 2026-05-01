/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

import { ResultActionBar } from "@/features/home/generation-result-actions";
import { ImagePreviewDialog, type ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";
import type { CharacterPosterImage, CharacterPosterState } from "./character-poster-app-state";
import styles from "./prompt-apps.module.css";

export function PosterResultPanel({ state }: Readonly<{ state: CharacterPosterState }>) {
  const [previewImage, setPreviewImage] = useState<ImagePreviewDialogImage | null>(null);
  const resultStageClassName = state.status === "success"
    ? `${styles.resultStage} ${styles.resultStagePreview}`
    : styles.resultStage;

  return (
    <aside className={styles.posterResult}>
      <div className={resultStageClassName}>
        <span className={styles.resultLabel}>{getResultLabel(state)}</span>
        {state.status === "idle" ? <p>填写左侧表单后，结果会显示在这里。</p> : null}
        {state.status === "submitting" ? <p>任务已提交，正在等待图片结果。</p> : null}
        {state.status === "error" ? <p className={styles.errorText}>{state.message}</p> : null}
        {state.status === "success" ? <PosterImageGrid images={state.images} jobId={state.jobId} onPreview={setPreviewImage} /> : null}
      </div>
      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </aside>
  );
}

function PosterImageGrid(props: Readonly<{ images: readonly CharacterPosterImage[]; jobId: number; onPreview: (image: ImagePreviewDialogImage) => void }>) {
  const gridClassName = props.images.length === 1
    ? `${styles.posterImageGrid} ${styles.posterImageGridSingle}`
    : styles.posterImageGrid;

  return (
    <div className={gridClassName}>
      {props.images.map((image) => (
        <figure className={styles.posterImageCard} key={image.id}>
          <button
            className={styles.posterImageButton}
            type="button"
            onClick={() => props.onPreview({ src: image.url, alt: `角色海报生成结果 ${props.jobId}-${image.id}` })}
          >
            <img alt={`角色海报生成结果 ${props.jobId}-${image.id}`} src={image.url} />
          </button>
          <ResultActionBar hasImages image={image} imageUrl={image.url} layout="card" />
        </figure>
      ))}
    </div>
  );
}

function getResultLabel(state: CharacterPosterState) {
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
