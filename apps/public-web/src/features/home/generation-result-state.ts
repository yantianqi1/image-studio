import type { GenerationHistoryItem } from "@/features/home/generation-history.types";
import type { GenerationState } from "@/features/home/generation-workbench.types";

export type ResultStep = "submit" | "queue" | "generate" | "writeback" | "complete";
export type ResultViewKind =
  | "idle"
  | "created"
  | "queued"
  | "generating"
  | "success_without_images"
  | "success_with_images"
  | "failed";

export type ResultView = Readonly<{
  kind: ResultViewKind;
  badgeLabel: string;
  badgeTone: "idle" | "created" | "queued" | "generating" | "success" | "failed";
  activeStep: ResultStep;
  title: string;
  description: string;
  eyebrow: string;
}>;

const RUNNING_STATUSES = new Set(["running", "generating", "processing"]);
const QUEUED_STATUSES = new Set(["queued", "pending", "created", "scheduled"]);
const SUCCEEDED_STATUSES = new Set(["succeeded", "success", "completed"]);
const FAILED_STATUSES = new Set(["failed", "error"]);

export function deriveResultView(
  historyItem: GenerationHistoryItem | null,
  state: GenerationState,
): ResultView {
  if (state.status === "error" || isFailed(historyItem)) {
    return failedView;
  }
  if (historyItem?.images.length) {
    return successWithImagesView;
  }
  if (isSucceededWithoutImages(historyItem, state)) {
    return successWithoutImagesView;
  }
  if (isGenerating(historyItem)) {
    return generatingView;
  }
  if (isQueued(historyItem)) {
    return queuedView;
  }
  if (state.status === "submitting" || historyItem?.taskId) {
    return createdView;
  }
  return idleView;
}

function isFailed(historyItem: GenerationHistoryItem | null) {
  const status = normalizeStatus(historyItem?.taskStatus ?? historyItem?.status);
  return status ? FAILED_STATUSES.has(status) : false;
}

function isSucceededWithoutImages(historyItem: GenerationHistoryItem | null, state: GenerationState) {
  if (state.status === "success") {
    return true;
  }
  const status = normalizeStatus(historyItem?.taskStatus ?? historyItem?.status);
  return status ? SUCCEEDED_STATUSES.has(status) : false;
}

function isGenerating(historyItem: GenerationHistoryItem | null) {
  const taskStatus = normalizeStatus(historyItem?.taskStatus);
  if (taskStatus) {
    return RUNNING_STATUSES.has(taskStatus);
  }
  return historyItem?.status === "generating";
}

function isQueued(historyItem: GenerationHistoryItem | null) {
  const taskStatus = normalizeStatus(historyItem?.taskStatus);
  if (taskStatus) {
    return QUEUED_STATUSES.has(taskStatus);
  }
  return historyItem?.status === "pending";
}

function normalizeStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() || null;
}

const idleView: ResultView = {
  kind: "idle",
  badgeLabel: "等待输入",
  badgeTone: "idle",
  activeStep: "submit",
  eyebrow: "READY",
  title: "你的生成结果将显示在这里",
  description: "输入提示词并点击生成，AI 将为你创作图像",
};

const createdView: ResultView = {
  kind: "created",
  badgeLabel: "任务已创建",
  badgeTone: "created",
  activeStep: "submit",
  eyebrow: "CREATED",
  title: "任务已进入生成流程",
  description: "系统已成功接收任务，正在准备进入生成队列。",
};

const queuedView: ResultView = {
  kind: "queued",
  badgeLabel: "等待处理",
  badgeTone: "queued",
  activeStep: "queue",
  eyebrow: "QUEUED",
  title: "任务已提交，准备生成",
  description: "任务已写入后台处理流程，worker 领取后会开始生成并自动刷新结果。",
};

const generatingView: ResultView = {
  kind: "generating",
  badgeLabel: "生成中",
  badgeTone: "generating",
  activeStep: "generate",
  eyebrow: "GENERATING",
  title: "正在为你生成图像",
  description: "模型正在创作图像，你可以保留当前页面，结果会自动刷新。",
};

const successWithoutImagesView: ResultView = {
  kind: "success_without_images",
  badgeLabel: "处理中",
  badgeTone: "generating",
  activeStep: "writeback",
  eyebrow: "SYNCING",
  title: "正在等待图片结果写回",
  description: "任务流程正常，图片结果写回后会自动出现在预览画布中。",
};

const successWithImagesView: ResultView = {
  kind: "success_with_images",
  badgeLabel: "已完成",
  badgeTone: "success",
  activeStep: "complete",
  eyebrow: "DONE",
  title: "图片已生成",
  description: "结果已返回，可下载或继续创作。",
};

const failedView: ResultView = {
  kind: "failed",
  badgeLabel: "失败",
  badgeTone: "failed",
  activeStep: "submit",
  eyebrow: "FAILED",
  title: "生成失败",
  description: "本次任务没有完成，请检查提示词或稍后重新生成。",
};
