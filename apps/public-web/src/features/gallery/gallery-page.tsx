"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { GalleryMasonry } from "@/features/gallery/gallery-masonry";
import { GalleryTagFilter, buildGalleryTagOptions, filterGalleryItemsByTag } from "@/features/gallery/gallery-tags";
import { AppShell } from "@/features/shell/app-shell";
import { ErrorMessage } from "@/features/ui/error-message";
import { ImagePreviewDialog, type ImagePreviewDialogImage } from "@/features/ui/image-preview-dialog";
import { StatusCard } from "@/features/ui/status-card";
import { ApiError } from "@/lib/api-client";
import { publicApi, type ImageGalleryItem, type ImageGalleryScope } from "@/lib/public-api";
import styles from "./gallery-page.module.css";

const UNAUTHORIZED_STATUS = 401;

const GALLERY_SCOPES: readonly Readonly<{
  value: ImageGalleryScope;
  label: string;
}>[] = [
  { value: "public", label: "公开图库" },
  { value: "mine", label: "个人图库" },
];

type GalleryState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string; statusCode?: number }>
  | Readonly<{ status: "ready"; data: readonly ImageGalleryItem[] }>;

type GalleryPageProps = Readonly<{
  activeHref?: string;
  initialScope?: ImageGalleryScope;
}>;

export function GalleryPage({
  activeHref = "/",
  initialScope = "mine",
}: GalleryPageProps = {}) {
  const [scope, setScope] = useState<ImageGalleryScope>(initialScope);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ImagePreviewDialogImage | null>(null);
  const { galleryState, mutate } = useGalleryData(scope);
  const filteredState = useMemo(() => filterGalleryState(galleryState, selectedTag), [galleryState, selectedTag]);
  const tagOptions = useMemo(() => resolveGalleryTagOptions(galleryState), [galleryState]);

  return (
    <AppShell activeHref={activeHref} headerTitle="图库">
      <div className={styles.page}>
        <GalleryHeader scope={scope} state={filteredState} onScopeChange={(nextScope) => {
          setScope(nextScope);
          setSelectedTag(null);
        }} />
        <GalleryTagFilter tags={tagOptions} selectedTag={selectedTag} onTagChange={setSelectedTag} />
        <GalleryContent state={filteredState} scope={scope} selectedTag={selectedTag} onPreview={setPreviewImage} onMutate={mutate} />
      </div>
      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </AppShell>
  );
}

function useGalleryData(scope: ImageGalleryScope): { galleryState: GalleryState; mutate: () => void } {
  const { data, error, mutate } = useSWR(
    `image-gallery-${scope}`,
    () => publicApi.getImageGallery(scope),
  );

  if (data) {
    return { galleryState: { status: "ready", data }, mutate };
  }
  if (error) {
    return {
      galleryState: {
        status: "error",
        message: error instanceof Error ? error.message : "未知请求错误",
        statusCode: error instanceof ApiError ? error.status : undefined,
      },
      mutate,
    };
  }
  return { galleryState: { status: "loading" }, mutate };
}

function GalleryHeader({
  scope,
  state,
  onScopeChange,
}: Readonly<{
  scope: ImageGalleryScope;
  state: GalleryState;
  onScopeChange: (scope: ImageGalleryScope) => void;
}>) {
  return (
    <header className={styles.header}>
      <div className={styles.masthead}>
        <h1 className={styles.title}>图片库</h1>
        <p className={styles.summary}>{getGallerySummary(scope, state)}</p>
      </div>
      <div className={styles.galleryToolbar}>
        <ScopeSegmentedControl scope={scope} onScopeChange={onScopeChange} />
        <span className={styles.countBadge}>{getGalleryCountLabel(state)}</span>
      </div>
    </header>
  );
}

function ScopeSegmentedControl({
  scope,
  onScopeChange,
}: Readonly<{
  scope: ImageGalleryScope;
  onScopeChange: (scope: ImageGalleryScope) => void;
}>) {
  return (
    <div className={styles.scopeTabs} role="tablist" aria-label="图库范围">
      {GALLERY_SCOPES.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={scope === item.value}
          className={scope === item.value ? `${styles.scopeTab} ${styles.scopeTabActive}` : styles.scopeTab}
          type="button"
          onClick={() => onScopeChange(item.value)}
        >
          <span className={styles.scopeTabMark} aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function GalleryContent({
  state,
  scope,
  selectedTag,
  onPreview,
  onMutate,
}: Readonly<{
  state: GalleryState;
  scope: ImageGalleryScope;
  selectedTag: string | null;
  onPreview: (image: ImagePreviewDialogImage) => void;
  onMutate: () => void;
}>) {
  if (state.status === "loading") {
    return <StatusCard title="加载中" description="正在读取图片图库..." tone="loading" />;
  }
  if (state.status === "error") {
    return <GalleryError state={state} scope={scope} />;
  }
  if (state.data.length === 0) {
    return <StatusCard title="暂无图片" description={getEmptyDescription(scope, selectedTag)} tone="empty" />;
  }

  return <GalleryMasonry items={state.data} scope={scope} onPreview={onPreview} onMutate={onMutate} />;
}

function GalleryError({
  state,
  scope,
}: Readonly<{
  state: Extract<GalleryState, { status: "error" }>;
  scope: ImageGalleryScope;
}>) {
  if (scope === "mine" && state.statusCode === UNAUTHORIZED_STATUS) {
    return <StatusCard title="未登录" description="登录后可以查看自己的图片库。" tone="neutral" />;
  }
  return <ErrorMessage message={state.message} title="图库读取失败" />;
}

function getGalleryCountLabel(state: GalleryState) {
  if (state.status === "loading") {
    return "同步中";
  }
  if (state.status === "error") {
    return "读取失败";
  }
  return `${state.data.length} 张`;
}

function getGallerySummary(
  scope: ImageGalleryScope,
  state: GalleryState,
) {
  return `${getScopeLabel(scope)} · ${getGalleryCountLabel(state)}`;
}

function getEmptyDescription(scope: ImageGalleryScope, selectedTag: string | null) {
  if (selectedTag) {
    return "没有匹配该标签的图片。";
  }
  return scope === "public"
    ? "还没有公开展示的图片。"
    : "生成图片后会出现在这里。";
}

function getScopeLabel(scope: ImageGalleryScope) {
  return scope === "public" ? "公开图库" : "个人图库";
}

function filterGalleryState(state: GalleryState, selectedTag: string | null): GalleryState {
  if (state.status !== "ready") {
    return state;
  }
  return { status: "ready", data: filterGalleryItemsByTag(state.data, selectedTag) };
}

function resolveGalleryTagOptions(state: GalleryState): readonly string[] {
  if (state.status !== "ready") {
    return [];
  }
  return buildGalleryTagOptions(state.data);
}
