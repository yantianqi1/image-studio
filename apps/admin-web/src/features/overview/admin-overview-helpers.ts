import type { AdminAuditLog, AdminRedeemBatchSummary } from "@/lib/admin-api";
import type { AdminComicTask } from "@/lib/use-admin-data";
import { errorMessage, formatDateTime } from "@/features/users/user-format";

export const PREVIEW_LIMIT = 5;
export const WALLET_AUDIT_PAGE_SIZE = 20;
export const SITE_CREDIT_CENTS = 10;
export const LARGE_WALLET_ADJUSTMENT_CREDITS = 1000;

type WorkerAlert = Readonly<{
  code: string;
  message: string;
  count: number;
  threshold: number;
}>;

export type PendingWorkItem = Readonly<{
  label: string;
  detail: string;
  href: string;
  tone: "neutral" | "warning" | "danger";
  toneLabel: string;
  hint: string;
}>;

export function buildPendingItems(
  failedImageCount: number,
  comicTasks: readonly AdminComicTask[],
  alerts: readonly WorkerAlert[],
  walletAdjustments: readonly AdminAuditLog[],
  batches: readonly AdminRedeemBatchSummary[],
) {
  const items: PendingWorkItem[] = [];
  pushFailedImageItem(items, failedImageCount);
  pushFailedComicItem(items, comicTasks);
  pushWorkerAlertItems(items, alerts);
  pushLargeAdjustmentItems(items, walletAdjustments);
  pushRedeemBatchItem(items, batches);
  return items.slice(0, 4);
}

export function readAmountCents(log: AdminAuditLog) {
  const amount = log.metadata.amount_cents;
  return typeof amount === "number" ? amount : null;
}

export function metricValue(loading: boolean, error: unknown, value: number | undefined) {
  if (loading) {
    return "读取中";
  }
  if (error) {
    return "读取失败";
  }
  return value === undefined ? "0" : String(value);
}

export function metricHint(loading: boolean, error: unknown, hint: string) {
  if (loading) {
    return "正在加载";
  }
  return error ? errorMessage(error, hint) : hint;
}

export function queueValue(loading: boolean, error: unknown, queue: { queued: number; running: number } | undefined) {
  if (loading) {
    return "读取中";
  }
  if (error) {
    return "读取失败";
  }
  return queue ? `${queue.queued} / ${queue.running}` : "0";
}

export function queueHint(loading: boolean, error: unknown) {
  if (loading) {
    return "正在加载";
  }
  return error ? errorMessage(error, "队列统计失败") : "排队 / 运行中";
}

export function workerAlertValue(loading: boolean, error: unknown, count: number | undefined) {
  if (loading) {
    return "读取中";
  }
  if (error) {
    return "读取失败";
  }
  return count === undefined || count === 0 ? "正常" : `${count} 个告警`;
}

export function workerAlertHint(loading: boolean, error: unknown, staleAfterSeconds: number | undefined) {
  if (loading) {
    return "正在加载";
  }
  if (error) {
    return errorMessage(error, "worker 状态失败");
  }
  return staleAfterSeconds === undefined ? "stale 运行中任务" : `stale 判定：${staleAfterSeconds}s`;
}

export function successRateValue(loading: boolean, error: unknown, value: number | undefined) {
  if (loading) {
    return "读取中";
  }
  if (error) {
    return "读取失败";
  }
  return value === undefined ? "0%" : `${Math.round(value * 100)}%`;
}

export function comicTaskFailureValue(loading: boolean, error: unknown, tasks: readonly AdminComicTask[] | undefined) {
  if (loading) {
    return "读取中";
  }
  if (error) {
    return "读取失败";
  }
  return tasks ? String(tasks.filter((task) => task.status === "failed").length) : "0";
}

export function comicTaskFailureHint(loading: boolean, error: unknown) {
  if (loading) {
    return "正在加载";
  }
  return error ? errorMessage(error, "漫画任务统计失败") : "来自 /api/admin/comic/tasks";
}

export function firstError(errors: readonly unknown[]) {
  return errors.find(Boolean);
}

function pushFailedImageItem(items: PendingWorkItem[], failedImageCount: number) {
  if (failedImageCount <= 0) {
    return;
  }
  items.push({
    label: "失败图片任务",
    detail: `${failedImageCount} 个失败图片任务需要处理`,
    href: "/admin/image-jobs",
    tone: "danger",
    toneLabel: "查看",
    hint: "图片生成队列存在失败项。",
  });
}

function pushFailedComicItem(items: PendingWorkItem[], comicTasks: readonly AdminComicTask[]) {
  const failedComicCount = comicTasks.filter((task) => task.status === "failed").length;
  if (failedComicCount <= 0) {
    return;
  }
  items.push({
    label: "失败漫画任务",
    detail: `${failedComicCount} 个失败漫画任务需要处理`,
    href: "/admin/comic-jobs",
    tone: "danger",
    toneLabel: "查看",
    hint: "漫画 pipeline 存在失败项。",
  });
}

function pushWorkerAlertItems(items: PendingWorkItem[], alerts: readonly WorkerAlert[]) {
  for (const alert of alerts) {
    items.push({
      label: alert.code,
      detail: alert.message,
      href: "/admin/image-jobs",
      tone: "warning",
      toneLabel: "告警",
      hint: `阈值 ${alert.threshold}，当前 ${alert.count}`,
    });
  }
}

function pushLargeAdjustmentItems(items: PendingWorkItem[], walletAdjustments: readonly AdminAuditLog[]) {
  const largeAdjustments = walletAdjustments.filter(isLargeAdjustment);
  for (const log of largeAdjustments.slice(-PREVIEW_LIMIT)) {
    items.push({
      label: "异常或大额调账",
      detail: `${log.reason} · #${log.target_id}`,
      href: "/admin/audit",
      tone: "warning",
      toneLabel: "审计",
      hint: formatDateTime(log.created_at),
    });
  }
}

function pushRedeemBatchItem(items: PendingWorkItem[], batches: readonly AdminRedeemBatchSummary[]) {
  if (batches.length === 0) {
    return;
  }
  const latestBatch = batches[batches.length - 1];
  if (latestBatch.unused_quantity !== 0 || latestBatch.status !== "active") {
    return;
  }
  items.push({
    label: "兑换码批次耗尽",
    detail: latestBatch.name,
    href: "/admin/redeem",
    tone: "warning",
    toneLabel: "查看",
    hint: `${latestBatch.redeemed_quantity}/${latestBatch.quantity} 已兑换`,
  });
}

function isLargeAdjustment(log: AdminAuditLog) {
  const amountCents = readAmountCents(log);
  return amountCents !== null && Math.abs(amountCents) >= LARGE_WALLET_ADJUSTMENT_CREDITS * SITE_CREDIT_CENTS;
}
