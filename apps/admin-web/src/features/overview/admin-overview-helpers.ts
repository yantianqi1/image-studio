import type { AdminComicTask } from "@/lib/use-admin-data";
import { errorMessage } from "@/features/users/user-format";

export const PREVIEW_LIMIT = 5;

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
) {
  const items: PendingWorkItem[] = [];
  pushFailedImageItem(items, failedImageCount);
  pushFailedComicItem(items, comicTasks);
  pushWorkerAlertItems(items, alerts);
  return items.slice(0, 4);
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
  return staleAfterSeconds === undefined ? "运行超时任务" : `超时判定：${staleAfterSeconds}s`;
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
  return error ? errorMessage(error, "漫画任务统计失败") : "来自后台漫画任务接口";
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
    hint: "漫画流程存在失败项。",
  });
}

function pushWorkerAlertItems(items: PendingWorkItem[], alerts: readonly WorkerAlert[]) {
  for (const alert of alerts) {
    items.push({
      label: "图片任务超时告警",
      detail: `${alert.count} 个图片任务已超过告警阈值 ${alert.threshold}`,
      href: "/admin/image-jobs",
      tone: "warning",
      toneLabel: "告警",
      hint: "图片任务存在长时间运行。",
    });
  }
}
