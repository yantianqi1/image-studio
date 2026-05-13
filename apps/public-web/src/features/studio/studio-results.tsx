"use client";

import { memo, useEffect, useRef } from "react";

import type { TurnProgress } from "@/features/studio/studio-turn-progress";
import type { ImageAssetVisibility } from "@/lib/public-api";
import type { StudioConversation, StudioTurn, StoredImage } from "@/features/studio/studio-types";
import styles from "./studio-results.module.css";

type StudioResultsProps = Readonly<{
  conversation: StudioConversation | null;
  progressByTurnKey: ReadonlyMap<string, TurnProgress>;
  onRetryTurn: (turnId: string) => void;
  onEditFromTurn: (turnId: string, image: StoredImage) => void;
  onCancelTurn: (turnId: string) => void;
  onImageVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
  onOpenLightbox: (images: readonly StoredImage[], startIndex: number) => void;
}>;

const MODE_LABELS: Record<string, { label: string; className: string }> = {
  generate: { label: "生成", className: styles.modeBadgeGenerate },
  edit: { label: "编辑", className: styles.modeBadgeEdit },
  chat: { label: "聊天", className: styles.modeBadgeChat },
};

function formatTurnTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatElapsed(ms: number | undefined) {
  if (!ms) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const StudioResults = memo(function StudioResults({
  conversation,
  progressByTurnKey,
  onRetryTurn,
  onEditFromTurn,
  onCancelTurn,
  onImageVisibilityChange,
  onOpenLightbox,
}: StudioResultsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const turnCountRef = useRef(0);

  // Auto-scroll when new turns are added
  useEffect(() => {
    const turns = conversation?.turns ?? [];
    if (turns.length > turnCountRef.current) {
      viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
    }
    turnCountRef.current = turns.length;
  }, [conversation?.turns]);

  if (!conversation || conversation.turns.length === 0) {
    return (
      <div className={styles.viewport}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">&#10022;</div>
          <p className={styles.emptyTitle}>开始创作</p>
          <p className={styles.emptyHint}>
            在下方输入提示词，选择模型和参数，点击生成开始创作。支持多轮对话式生成和编辑。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.viewport} ref={viewportRef}>
      {conversation.turns.map((turn) => (
        <TurnCard
          key={turn.id}
          turn={turn}
          progress={progressByTurnKey.get(`${conversation.id}:${turn.id}`)}
          onRetry={() => onRetryTurn(turn.id)}
          onEditFromImage={(image) => onEditFromTurn(turn.id, image)}
          onCancel={() => onCancelTurn(turn.id)}
          onVisibilityChange={onImageVisibilityChange}
          onOpenLightbox={(startIndex) => onOpenLightbox(turn.images, startIndex)}
        />
      ))}
    </div>
  );
});

const TurnCard = memo(function TurnCard({
  turn,
  progress,
  onRetry,
  onEditFromImage,
  onCancel,
  onVisibilityChange,
  onOpenLightbox,
}: Readonly<{
  turn: StudioTurn;
  progress: TurnProgress | undefined;
  onRetry: () => void;
  onEditFromImage: (image: StoredImage) => void;
  onCancel: () => void;
  onVisibilityChange: (assetId: number, visibility: ImageAssetVisibility) => void;
  onOpenLightbox: (startIndex: number) => void;
}>) {
  const modeInfo = MODE_LABELS[turn.mode] ?? MODE_LABELS.generate;
  const isBusy = turn.status === "queued" || turn.status === "generating";

  return (
    <div className={styles.turnCard}>
      <div className={styles.turnHeader}>
        <span className={`${styles.modeBadge} ${modeInfo.className}`}>{modeInfo.label}</span>
        <span className={styles.turnModel}>{turn.model}</span>
        <span className={styles.turnTime}>{formatTurnTime(turn.createdAt)}</span>
      </div>

      <p className={styles.turnPrompt}>{turn.prompt}</p>

      {turn.mode === "chat" && turn.images.length > 0 && turn.images[0]?.revisedPrompt && (
        <div className={styles.chatResponse}>{turn.images[0].revisedPrompt}</div>
      )}

      {turn.mode !== "chat" && turn.images.length > 0 && (
        <div className={styles.imageGrid}>
          {turn.images.map((image, index) => (
            <div key={image.id} className={styles.imageWrapper}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.imageThumb}
                src={image.thumbnailUrl || image.url || ""}
                alt={turn.prompt}
                onClick={() => onOpenLightbox(index)}
              />
              {image.visibility && (
                <span className={styles.visibilityBadge}>
                  {image.visibility === "public" ? "公开" : "私密"}
                </span>
              )}
              <div className={styles.imageActions}>
                {image.assetId != null && (
                  <button
                    className={styles.imageActionButton}
                    onClick={() => onVisibilityChange(image.assetId!, image.visibility === "public" ? "private" : "public")}
                    title="切换可见性"
                    type="button"
                  >
                    {image.visibility === "public" ? "\u{1F513}" : "\u{1F512}"}
                  </button>
                )}
                <button
                  className={styles.imageActionButton}
                  onClick={() => onEditFromImage(image)}
                  title="用作参考图"
                  type="button"
                >
                  &#9998;
                </button>
                {image.url && (
                  <button
                    className={styles.imageActionButton}
                    onClick={() => downloadImage(image.url!, turn.prompt)}
                    title="下载"
                    type="button"
                  >
                    &#8595;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {isBusy && (
        <div className={`${styles.statusRow} ${turn.status === "generating" ? styles.statusGenerating : styles.statusQueued}`}>
          <span className={styles.spinner} />
          <span>{turn.status === "generating" ? "生成中" : "排队中"}</span>
          {progress && (
            <>
              <span className={styles.progressText}>{progress.message}</span>
              {progress.elapsedMs != null && <span className={styles.progressText}>{formatElapsed(progress.elapsedMs)}</span>}
            </>
          )}
        </div>
      )}

      {turn.status === "error" && (
        <div className={`${styles.statusRow} ${styles.statusError}`}>
          <span>{turn.error || "生成失败"}</span>
        </div>
      )}

      <div className={styles.turnActions}>
        {turn.status === "error" && (
          <button className={styles.turnActionButton} onClick={onRetry} type="button">重试</button>
        )}
        {isBusy && (
          <button className={`${styles.turnActionButton} ${styles.turnActionButtonDanger}`} onClick={onCancel} type="button">取消</button>
        )}
      </div>
    </div>
  );
});

function downloadImage(url: string, prompt: string) {
  const name = prompt.slice(0, 20).replace(/[^\w一-鿿]/g, "_") || "image";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  a.click();
}
