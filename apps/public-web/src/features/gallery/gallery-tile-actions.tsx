"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ImageGalleryItem, ImageGalleryScope } from "@/lib/public-api";
import { publicApi } from "@/lib/public-api";
import actionStyles from "./gallery-actions.module.css";

const COPY_FEEDBACK_VISIBLE_MS = 1600;

type CopyStatus = "idle" | "success" | "error";

export function GalleryTileActions({
  item,
  scope,
  onMutate,
}: Readonly<{
  item: ImageGalleryItem;
  scope: ImageGalleryScope;
  onMutate: () => void;
}>) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setCopyStatus("idle"), COPY_FEEDBACK_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  async function handleCopyPrompt() {
    try {
      await copyPromptToClipboard(item.prompt);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  async function handleToggleVisibility() {
    if (actionPending) return;
    setActionPending(true);
    try {
      const nextVisibility = item.visibility === "public" ? "private" : "public";
      await publicApi.updateImageAssetVisibility(item.asset_id, nextVisibility);
      onMutate();
    } finally {
      setActionPending(false);
    }
  }

  async function handleDelete() {
    if (actionPending) return;
    if (!window.confirm("确定删除这张图片？此操作不可撤销。")) return;
    setActionPending(true);
    try {
      await publicApi.deleteImageAsset(item.asset_id);
      onMutate();
    } finally {
      setActionPending(false);
    }
  }

  const showOwnerActions = scope === "mine";

  return (
    <div className={actionStyles.actionBar} aria-label="图片操作">
      <button className={actionStyles.actionButton} type="button" onClick={() => void handleCopyPrompt()}>
        复制
      </button>
      <Link className={actionStyles.actionButton} href={buildReusePromptHref(item.prompt)}>
        复用
      </Link>
      <a className={actionStyles.actionButton} href={item.asset_url} download={buildDownloadName(item)}>
        下载
      </a>
      {showOwnerActions && item.visibility === "public" && (
        <button className={actionStyles.actionButton} type="button" disabled={actionPending} onClick={() => void handleToggleVisibility()}>
          取消分享
        </button>
      )}
      {showOwnerActions && item.visibility === "private" && (
        <button className={actionStyles.actionButton} type="button" disabled={actionPending} onClick={() => void handleToggleVisibility()}>
          公开
        </button>
      )}
      {showOwnerActions && (
        <button className={`${actionStyles.actionButton} ${actionStyles.actionButtonDanger}`} type="button" disabled={actionPending} onClick={() => void handleDelete()}>
          删除
        </button>
      )}
      <CopyStatusNotice copyStatus={copyStatus} />
    </div>
  );
}

function CopyStatusNotice({ copyStatus }: Readonly<{ copyStatus: CopyStatus }>) {
  if (copyStatus === "idle") {
    return null;
  }
  return (
    <span className={copyStatus === "success" ? actionStyles.actionNotice : `${actionStyles.actionNotice} ${actionStyles.actionNoticeError}`}>
      {copyStatus === "success" ? "已复制" : "复制失败"}
    </span>
  );
}

async function copyPromptToClipboard(prompt: string) {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable.");
  }
  await navigator.clipboard.writeText(prompt);
}

function buildReusePromptHref(prompt: string) {
  return `/generate?prompt=${encodeURIComponent(prompt)}`;
}

function buildDownloadName(item: ImageGalleryItem) {
  return `image-studio-${item.asset_id}.png`;
}
