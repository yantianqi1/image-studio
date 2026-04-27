import { useState } from "react";
import Image from "next/image";

import type { StoryboardShot } from "./comic-utils";

import { EmptyState, ErrorState, StatusBadge, toStatusTone } from "./comic-status";
import { downloadSequentialImages, downloadStitchedImage } from "./comic-preview-export";
import { canSelectAdjacentShot, selectAdjacentShotId, type ShotDirection } from "./comic-preview-utils";
import layout from "./comic-workspace.module.css";
import styles from "./comic-preview.module.css";

type MangaPreviewPanelProps = Readonly<{
  shots: readonly StoryboardShot[];
  selectedShot: StoryboardShot | null;
  projectTitle: string;
  status: string;
  errorMessage?: string;
  onSelectShot: (shotId: string) => void;
  onRetry: () => void;
}>;

export function MangaPreviewPanel(props: MangaPreviewPanelProps) {
  const [previewShot, setPreviewShot] = useState<StoryboardShot | null>(null);
  const tone = toStatusTone(props.status);
  const currentPage = props.selectedShot?.index ?? 1;
  const pageCount = Math.max(props.shots.length, 1);
  const selectedShotId = props.selectedShot?.id ?? null;
  const canGoPrevious = canSelectAdjacentShot({ shots: props.shots, selectedShotId, direction: "previous" });
  const canGoNext = canSelectAdjacentShot({ shots: props.shots, selectedShotId, direction: "next" });

  function moveToShot(direction: ShotDirection) {
    const shotId = selectAdjacentShotId({ shots: props.shots, selectedShotId, direction });
    if (shotId) props.onSelectShot(shotId);
  }

  return (
    <section className={layout.panel}>
      <div className={layout.panelHeader}>
        <div>
          <p className={layout.eyebrow}>GPT-image-2 · REAL JOBS</p>
          <h2>漫画生成预览</h2>
        </div>
        <PreviewActions
          projectTitle={props.projectTitle}
          selectedShot={props.selectedShot}
          shots={props.shots}
          onPreview={setPreviewShot}
        />
      </div>
      <div className={styles.chapterRow}>
        <span>第 1 章 · 第 {currentPage} 页（共 {pageCount} 页）</span>
        <div className={styles.pageControl}>
          <button type="button" disabled={!canGoPrevious} onClick={() => moveToShot("previous")}>上一页</button>
          <strong>{currentPage} / {pageCount}</strong>
          <button type="button" disabled={!canGoNext} onClick={() => moveToShot("next")}>下一页</button>
        </div>
      </div>
      <PreviewContent {...props} tone={tone} />
      <MangaGenerationMeta selectedShot={props.selectedShot} />
      <ImagePreviewOverlay shot={previewShot} onClose={() => setPreviewShot(null)} />
    </section>
  );
}

function PreviewActions(props: Readonly<{
  projectTitle: string;
  selectedShot: StoryboardShot | null;
  shots: readonly StoryboardShot[];
  onPreview: (shot: StoryboardShot) => void;
}>) {
  const [exporting, setExporting] = useState<"idle" | "sequential" | "stitched">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const canExport = props.shots.some((shot) => Boolean(shot.assetUrl));
  const selectedShot = props.selectedShot;
  const assetUrl = selectedShot?.assetUrl ?? undefined;

  async function runExport(kind: "sequential" | "stitched") {
    setExportError(null);
    setExporting(kind);
    try {
      const action = kind === "sequential" ? downloadSequentialImages : downloadStitchedImage;
      await action({ shots: props.shots, projectTitle: props.projectTitle });
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting("idle");
    }
  }

  return (
    <div className={styles.previewActionsWrap}>
      <div className={styles.previewActions}>
        <button type="button" disabled={!canExport || exporting !== "idle"} onClick={() => void runExport("sequential")}>
          {exporting === "sequential" ? "下载中" : "逐张导出"}
        </button>
        <button type="button" disabled={!canExport || exporting !== "idle"} onClick={() => void runExport("stitched")}>
          {exporting === "stitched" ? "拼接中" : "长图导出"}
        </button>
        {assetUrl && selectedShot ? (
          <button
            className={styles.darkButton}
            type="button"
            onClick={() => props.onPreview(selectedShot)}
          >
            打开图片
          </button>
        ) : (
          <button className={styles.darkButton} type="button" disabled title="暂无可打开图片">打开图片</button>
        )}
      </div>
      {exportError ? <p className={styles.exportError} role="alert">{exportError}</p> : null}
    </div>
  );
}

function PreviewContent(props: MangaPreviewPanelProps & Readonly<{ tone: ReturnType<typeof toStatusTone> }>) {
  if (props.tone === "failed") {
    return <ErrorState title="漫画生成失败" message={props.errorMessage ?? "任务执行失败，请查看任务详情。"} onRetry={props.onRetry} />;
  }
  if (props.shots.length === 0) {
    return <EmptyState title={emptyPreviewTitle(props.status)} description={emptyPreviewDescription(props.status)} icon="▧" />;
  }
  return <MangaPageGrid shots={props.shots} selectedShot={props.selectedShot} onSelectShot={props.onSelectShot} />;
}

function emptyPreviewTitle(status: string): string {
  if (status === "character_reference_pending") return "角色参考图待生成";
  if (status === "character_reference_generating") return "角色参考图生成中";
  if (status === "page_image_generating") return "漫画页面生成中";
  return "暂无漫画页面";
}

function emptyPreviewDescription(status: string): string {
  if (status === "character_reference_pending") return "后端任务完成后会先创建角色参考图任务。";
  if (status === "character_reference_generating") return "正在等待真实角色参考图任务完成，不显示假进度。";
  if (status === "page_image_generating") return "角色参考图已就绪，正在等待真实页面图片结果。";
  return "没有真实图片结果时不会展示生成中占位，提交并完成生成任务后会显示漫画画面";
}

function MangaPageGrid(props: Readonly<{
  shots: readonly StoryboardShot[];
  selectedShot: StoryboardShot | null;
  onSelectShot: (shotId: string) => void;
}>) {
  const selectedShot = props.selectedShot ?? props.shots[0];
  return (
    <div className={styles.previewStage}>
      <FeaturedPage shot={selectedShot} />
      <div className={styles.previewGrid}>
        {props.shots.map((shot) => (
          <PageCard
            key={shot.id}
            shot={shot}
            active={shot.id === selectedShot.id}
            onSelect={props.onSelectShot}
          />
        ))}
      </div>
    </div>
  );
}

function FeaturedPage({ shot }: Readonly<{ shot: StoryboardShot }>) {
  return (
    <article className={styles.featuredPage}>
      <PageVisual shot={shot} large />
    </article>
  );
}

function PageCard(props: Readonly<{
  shot: StoryboardShot;
  active: boolean;
  onSelect: (shotId: string) => void;
}>) {
  return (
    <button
      className={`${styles.pageCard} ${props.active ? styles.pageCardActive : ""}`}
      type="button"
      aria-pressed={props.active}
      onClick={() => props.onSelect(props.shot.id)}
    >
      <PageVisual shot={props.shot} />
      <div className={styles.pageMeta}>
        <strong>{props.shot.shotType}</strong>
        <StatusBadge status={props.shot.status} />
      </div>
    </button>
  );
}

function PageVisual({ shot, large = false }: Readonly<{ shot: StoryboardShot; large?: boolean }>) {
  if (shot.assetUrl) {
    return (
      <Image
        alt={shot.title}
        className={large ? styles.featuredImage : styles.pageImage}
        height={large ? 1600 : 640}
        src={shot.assetUrl}
        unoptimized
        width={large ? 1200 : 480}
      />
    );
  }
  return (
    <div className={large ? styles.featuredPlaceholder : styles.comicPlaceholder}>
      <span>{String(shot.index).padStart(2, "0")}</span>
    </div>
  );
}

function MangaGenerationMeta({ selectedShot }: Readonly<{ selectedShot: StoryboardShot | null }>) {
  return (
    <div className={styles.generationMeta}>
      <span>模型：GPT-image-2</span>
      <span>接口：Chat Completions</span>
      <span>参考图：随页面 job 传入</span>
      <span>当前 Job：{selectedShot?.imageJobId ?? "待创建"}</span>
    </div>
  );
}

function ImagePreviewOverlay(props: Readonly<{
  shot: StoryboardShot | null;
  onClose: () => void;
}>) {
  if (!props.shot?.assetUrl) {
    return null;
  }
  return (
    <div className={styles.previewOverlay} role="dialog" aria-modal="true" onClick={props.onClose}>
      <figure className={styles.previewOverlayFigure} onClick={(event) => event.stopPropagation()}>
        <Image
          alt={props.shot.title}
          height={1600}
          src={props.shot.assetUrl}
          unoptimized
          width={1200}
        />
      </figure>
    </div>
  );
}
