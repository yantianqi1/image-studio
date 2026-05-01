"use client";

import { useState } from "react";

import type { GenerationHistoryImage } from "@/features/home/generation-history.types";
import type { GenerationSourceImage } from "@/features/home/generation-workbench.types";
import { publicApi, type ImageAssetVisibility } from "@/lib/public-api";
import resultStyles from "./generation-result-panel.module.css";

export type ImageVisibilityChangeHandler = (
  assetId: number,
  visibility: ImageAssetVisibility,
  publishedAt: string | null,
) => void;

type ResultActionLayout = "default" | "card";
type ResultActionBarStateProps = Readonly<{
  failed: boolean;
  hasImages: boolean;
  image?: GenerationHistoryImage;
  imageUrl?: string;
  layout: ResultActionLayout;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>;

export function ResultActionBar({
  layout = "default",
  hasImages,
  imageUrl,
  image,
  failed = false,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: Readonly<{
  layout?: ResultActionLayout;
  hasImages: boolean;
  imageUrl?: string;
  image?: GenerationHistoryImage;
  failed?: boolean;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>) {
  return (
    <ResultActionBarState
      key={getResultActionStateKey(image)}
      failed={failed}
      hasImages={hasImages}
      image={image}
      imageUrl={imageUrl}
      layout={layout}
      onImageVisibilityChange={onImageVisibilityChange}
      onUseAsSourceImage={onUseAsSourceImage}
    />
  );
}

function ResultActionBarState({
  failed,
  hasImages,
  image,
  imageUrl,
  layout,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: ResultActionBarStateProps) {
  const visibilityAction = useImageVisibilityAction({ image, onImageVisibilityChange });

  return (
    <div className={getActionBarClassName(layout)}>
      <DownloadAction hasImages={hasImages} imageUrl={imageUrl} />
      <button className={resultStyles.softAction} type="button" disabled>{failed ? "重新生成" : "继续等待"}</button>
      <VisibilityAction
        image={image}
        isUpdating={visibilityAction.isUpdating}
        visibility={visibilityAction.visibility}
        onToggle={visibilityAction.handleToggle}
      />
      <SourceImageAction image={image} onUseAsSourceImage={onUseAsSourceImage} />
      {!hasImages ? <span className={resultStyles.actionHint}>系统会自动刷新，无需重复提交。</span> : null}
      {visibilityAction.error ? <span className={resultStyles.actionError}>{visibilityAction.error}</span> : null}
    </div>
  );
}

function useImageVisibilityAction(input: Readonly<{
  image?: GenerationHistoryImage;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
}>) {
  const [visibility, setVisibility] = useState<ImageAssetVisibility>(input.image?.visibility ?? "private");
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleToggle() {
    if (!input.image?.assetId || isUpdating) {
      return;
    }

    const nextVisibility = getNextVisibility(visibility);
    setIsUpdating(true);
    setError(null);
    try {
      const updated = await publicApi.updateImageAssetVisibility(input.image.assetId, nextVisibility);
      setVisibility(updated.visibility);
      input.onImageVisibilityChange?.(input.image.assetId, updated.visibility, updated.published_at);
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "图库状态更新失败");
    } finally {
      setIsUpdating(false);
    }
  }

  return { error, handleToggle, isUpdating, visibility };
}

function getResultActionStateKey(image?: GenerationHistoryImage) {
  return `${image?.assetId ?? "empty"}:${image?.visibility ?? "private"}`;
}

function DownloadAction({ hasImages, imageUrl }: Readonly<{ hasImages: boolean; imageUrl?: string }>) {
  if (hasImages && imageUrl) {
    return <a className={resultStyles.primaryAction} href={imageUrl} download>下载图片</a>;
  }

  return <button className={resultStyles.primaryAction} type="button" disabled>结果生成后可下载</button>;
}

function VisibilityAction({
  image,
  isUpdating,
  visibility,
  onToggle,
}: Readonly<{
  image?: GenerationHistoryImage;
  isUpdating: boolean;
  visibility: ImageAssetVisibility;
  onToggle: () => void;
}>) {
  if (!image?.assetId) {
    return null;
  }

  return (
    <button className={resultStyles.softAction} type="button" disabled={isUpdating} onClick={onToggle}>
      {isUpdating ? "更新中..." : getVisibilityActionLabel(visibility)}
    </button>
  );
}

function SourceImageAction({
  image,
  onUseAsSourceImage,
}: Readonly<{
  image?: GenerationHistoryImage;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>) {
  if (!image?.assetId || !onUseAsSourceImage) {
    return null;
  }

  return (
    <button
      className={resultStyles.softAction}
      type="button"
      onClick={() => onUseAsSourceImage?.({ assetId: image.assetId ?? 0, assetUrl: image.url })}
    >
      用作编辑源图
    </button>
  );
}

function getNextVisibility(visibility: ImageAssetVisibility): ImageAssetVisibility {
  return visibility === "public" ? "private" : "public";
}

function getActionBarClassName(layout: ResultActionLayout) {
  if (layout === "card") {
    return `${resultStyles.actionBar} ${resultStyles.actionBarCard}`;
  }
  return resultStyles.actionBar;
}

function getVisibilityActionLabel(visibility: ImageAssetVisibility) {
  return visibility === "public" ? "取消公开" : "公开到图库";
}
