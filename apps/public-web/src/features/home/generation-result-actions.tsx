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

export function ResultActionBar({
  hasImages,
  imageUrl,
  image,
  failed = false,
  onImageVisibilityChange,
  onUseAsSourceImage,
}: Readonly<{
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
  onImageVisibilityChange,
  onUseAsSourceImage,
}: Readonly<{
  failed: boolean;
  hasImages: boolean;
  image?: GenerationHistoryImage;
  imageUrl?: string;
  onImageVisibilityChange?: ImageVisibilityChangeHandler;
  onUseAsSourceImage?: (image: GenerationSourceImage) => void;
}>) {
  const [visibility, setVisibility] = useState<ImageAssetVisibility>(
    image?.visibility ?? "private",
  );
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  async function handleVisibilityToggle() {
    if (!image?.assetId || isUpdatingVisibility) {
      return;
    }

    const nextVisibility = getNextVisibility(visibility);
    setIsUpdatingVisibility(true);
    setVisibilityError(null);
    try {
      const updated = await publicApi.updateImageAssetVisibility(image.assetId, nextVisibility);
      setVisibility(updated.visibility);
      onImageVisibilityChange?.(image.assetId, updated.visibility, updated.published_at);
    } catch (error: unknown) {
      setVisibilityError(error instanceof Error ? error.message : "图库状态更新失败");
    } finally {
      setIsUpdatingVisibility(false);
    }
  }

  return (
    <div className={resultStyles.actionBar}>
      <DownloadAction hasImages={hasImages} imageUrl={imageUrl} />
      <button className={resultStyles.softAction} type="button" disabled>{failed ? "重新生成" : "继续等待"}</button>
      <VisibilityAction
        image={image}
        isUpdating={isUpdatingVisibility}
        visibility={visibility}
        onToggle={handleVisibilityToggle}
      />
      <SourceImageAction image={image} onUseAsSourceImage={onUseAsSourceImage} />
      {!hasImages ? <span className={resultStyles.actionHint}>系统会自动刷新，无需重复提交。</span> : null}
      {visibilityError ? <span className={resultStyles.actionError}>{visibilityError}</span> : null}
    </div>
  );
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
  if (!image?.assetId) {
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

function getVisibilityActionLabel(visibility: ImageAssetVisibility) {
  return visibility === "public" ? "取消公开" : "公开到图库";
}
