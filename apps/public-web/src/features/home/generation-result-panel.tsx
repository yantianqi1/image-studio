/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

import type { GenerationHistoryImage, GenerationHistoryItem } from "@/features/home/generation-history.types";
import { ResultActionBar, type ImageVisibilityChangeHandler } from "@/features/home/generation-result-actions";
import { deriveResultView, type ResultStep, type ResultView } from "@/features/home/generation-result-state";
import type { GenerationSourceImage, GenerationState } from "@/features/home/generation-workbench.types";
import { ImagePreviewDialog, type ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";
import styles from "./generation-workbench.module.css";
import resultStyles from "./generation-result-panel.module.css";

const RESULT_STEPS: readonly Readonly<{ key: ResultStep; label: string }>[]= [
  { key: "submit", label: "提交成功" },
  { key: "queue", label: "队列等待" },
  { key: "generate", label: "Worker 生成" },
  { key: "complete", label: "已完成" },
];

const STEP_ORDER: readonly ResultStep[] = ["submit", "queue", "generate", "complete"];

type ResultPanelProps = Readonly<{
  historyItem: GenerationHistoryItem | null;
  state: GenerationState;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>;

export function GenerationResultPanel({
  historyItem,
  state,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: ResultPanelProps) {
  const view = deriveResultView(historyItem, state);

  return (
    <section className={`${styles.workbenchCard} ${styles.resultPanel}`}>
      <ResultHeader view={view} />
      <div className={resultStyles.resultContent}>
        <PreviewCanvas
          historyItem={historyItem}
          state={state}
          view={view}
          onImageVisibilityChange={onImageVisibilityChange}
          onUseAsSourceImage={onUseAsSourceImage}
        />
      </div>
    </section>
  );
}

function ResultHeader({ view }: Readonly<{ view: ResultView }>) {
  return (
    <div className={resultStyles.header}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Canvas</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-gray-950">生成结果</h2>
      </div>
      <StatusBadge view={view} />
    </div>
  );
}

function StatusBadge({ view }: Readonly<{ view: ResultView }>) {
  const toneClass = {
    idle: resultStyles.badgeIdle,
    created: resultStyles.badgeCreated,
    queued: resultStyles.badgeQueued,
    generating: resultStyles.badgeGenerating,
    success: resultStyles.badgeSuccess,
    failed: resultStyles.badgeFailed,
  }[view.badgeTone];
  return <span className={`${resultStyles.badge} ${toneClass}`}><span className={resultStyles.badgeDot} />{view.badgeLabel}</span>;
}

function PreviewCanvas({
  historyItem,
  state,
  view,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: Readonly<{
  historyItem: GenerationHistoryItem | null;
  state: GenerationState;
  view: ResultView;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>) {
  if (view.kind === "success_with_images" && historyItem) {
    return (
      <ImageGrid
        historyItem={historyItem}
        onImageVisibilityChange={onImageVisibilityChange}
        onUseAsSourceImage={onUseAsSourceImage}
      />
    );
  }
  if (view.kind === "failed") {
    return <ErrorState historyItem={historyItem} message={state.status === "error" ? state.message : historyItem?.errorMessage ?? view.description} view={view} />;
  }
  if (view.kind === "idle") {
    return <EmptyState view={view} />;
  }
  return <WaitingState view={view} />;
}

function EmptyState({ view }: Readonly<{ view: ResultView }>) {
  return (
    <div className={resultStyles.canvasShell}>
      <div className={`${resultStyles.aiCanvas} items-center text-center`}>
        <div className="m-auto grid justify-items-center">
          <CanvasIcon />
          <p className={resultStyles.canvasTitle}>{view.title}</p>
          <p className={resultStyles.canvasText}>{view.description}</p>
        </div>
      </div>
    </div>
  );
}

function WaitingState({ view }: Readonly<{ view: ResultView }>) {
  return (
    <div className={resultStyles.canvasShell}>
      <div className={resultStyles.waitingLayout}>
        <WaitingCanvas view={view} />
      </div>
      <ResultActionBar hasImages={false} />
    </div>
  );
}

function WaitingCanvas({ view }: Readonly<{ view: ResultView }>) {
  return (
    <div className={resultStyles.aiCanvas}>
      <div>
        <div className={resultStyles.pulseOrb}><CanvasIcon compact /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">{view.eyebrow}</p>
        <h3 className={resultStyles.canvasTitle}>{view.title}</h3>
        <p className={resultStyles.canvasText}>{view.description}</p>
        <SkeletonPreview />
      </div>
      <ProgressSteps activeStep={view.activeStep} />
    </div>
  );
}

function ProgressSteps({ activeStep }: Readonly<{ activeStep: ResultStep }>) {
  const activeIndex = STEP_ORDER.indexOf(activeStep);
  return (
    <div className={resultStyles.steps}>
      {RESULT_STEPS.map((step, index) => {
        const stateClass = index < activeIndex ? resultStyles.stepDone : index === activeIndex ? resultStyles.stepActive : "";
        return <div key={step.key} className={`${resultStyles.step} ${stateClass}`}><span className={resultStyles.stepMarker}>{index < activeIndex ? "✓" : index + 1}</span><span>{step.label}</span></div>;
      })}
    </div>
  );
}

function SkeletonPreview() {
  return <div className={resultStyles.skeletonGrid}>{[0, 1, 2, 3].map((item) => <div key={item} className={resultStyles.skeletonTile} />)}</div>;
}

function ImageGrid({
  historyItem,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: Readonly<{
  historyItem: GenerationHistoryItem;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>) {
  const [previewImage, setPreviewImage] = useState<ImagePreviewDialogImage | null>(null);
  const gridClass = historyItem.images.length > 1 ? `${resultStyles.imageGrid} ${resultStyles.imageGridMany}` : resultStyles.imageGrid;
  return (
    <>
      <div className={gridClass}>
        {historyItem.images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            title={historyItem.title}
            onPreview={setPreviewImage}
            onImageVisibilityChange={onImageVisibilityChange}
            onUseAsSourceImage={onUseAsSourceImage}
          />
        ))}
      </div>
      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  );
}

function ImageCard({
  image,
  title,
  onPreview,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: Readonly<{
  image: GenerationHistoryImage;
  title: string;
  onPreview: (image: ImagePreviewDialogImage) => void;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>) {
  return (
    <article className={resultStyles.imageCard}>
      <button
        className={resultStyles.imagePreviewButton}
        type="button"
        onClick={() => onPreview({ src: image.url, alt: title })}
      >
        <img
          src={getPreviewImageUrl(image)}
          alt={title}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1280px) 34vw, (min-width: 1024px) 50vw, 100vw"
        />
      </button>
      <ResultActionBar
        hasImages
        imageUrl={image.url}
        image={image}
        onImageVisibilityChange={onImageVisibilityChange}
        onUseAsSourceImage={onUseAsSourceImage}
      />
    </article>
  );
}

function getPreviewImageUrl(image: GenerationHistoryImage) {
  if (image.thumbnailUrl) {
    return image.thumbnailUrl;
  }
  if (image.assetId !== undefined) {
    return `/api/public/image/assets/${image.assetId}/thumbnail`;
  }
  return image.url;
}

function ErrorState({ historyItem, message, view }: Readonly<{ historyItem: GenerationHistoryItem | null; message: string; view: ResultView }>) {
  return (
    <div className={resultStyles.canvasShell}>
      <div className={`${resultStyles.aiCanvas} ${resultStyles.errorCanvas}`}>
        <div>
          <div className={resultStyles.pulseOrb}><CanvasIcon compact /></div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-red-300">{view.eyebrow}</p>
          <h3 className={resultStyles.canvasTitle}>{view.title}</h3>
          <p className={resultStyles.canvasText}>{message}</p>
          {historyItem?.prompt ? <div className={resultStyles.promptBox}><p className={resultStyles.infoLabel}>Prompt</p><p className={resultStyles.promptText}>{historyItem.prompt}</p></div> : null}
        </div>
        <ResultActionBar hasImages={false} failed />
      </div>
    </div>
  );
}

function CanvasIcon({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <svg aria-hidden="true" className={compact ? "h-6 w-6" : "h-7 w-7 text-gray-400"} fill="none" viewBox="0 0 24 24">
      <path d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7 16 3.2-3.2a1 1 0 0 1 1.42.01l1.2 1.22a1 1 0 0 0 1.43 0L16 12.25 19 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M8.7 9.2h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.8" />
    </svg>
  );
}
