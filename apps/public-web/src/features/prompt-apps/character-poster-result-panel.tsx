/* eslint-disable @next/next/no-img-element */

import type { CharacterPosterImage, CharacterPosterState } from "./character-poster-app-state";
import styles from "./prompt-apps.module.css";

export function PosterResultPanel({ state }: Readonly<{ state: CharacterPosterState }>) {
  return (
    <aside className={styles.posterResult}>
      <div className={styles.resultStage}>
        <span className={styles.resultLabel}>{getResultLabel(state)}</span>
        {state.status === "idle" ? <p>填写左侧表单后，结果会显示在这里。</p> : null}
        {state.status === "submitting" ? <p>任务已提交，正在等待图片结果。</p> : null}
        {state.status === "error" ? <p className={styles.errorText}>{state.message}</p> : null}
        {state.status === "success" ? <PosterImageGrid images={state.images} jobId={state.jobId} /> : null}
      </div>
    </aside>
  );
}

function PosterImageGrid(props: Readonly<{ images: readonly CharacterPosterImage[]; jobId: number }>) {
  return (
    <div className={styles.posterImageGrid}>
      {props.images.map((image) => (
        <figure className={styles.posterImageCard} key={image.id}>
          <img alt={`角色海报生成结果 ${props.jobId}-${image.id}`} src={image.url} />
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
