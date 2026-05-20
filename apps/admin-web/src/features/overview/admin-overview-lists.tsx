"use client";

import Link from "next/link";

import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import { StatusPill } from "@/features/ui/status-pill";
import { formatComicStageLabel, formatComicTaskTypeLabel } from "@/features/ui/admin-labels";
import type { AdminImageJob } from "@/lib/admin-image-job-types";
import type { AdminComicTask } from "@/lib/use-admin-data";
import { errorMessage, formatDateTime } from "@/features/users/user-format";
import { formatJobErrorText, formatJobSource } from "@/features/jobs/image-job-format";
import {
  buildPendingItems,
  PREVIEW_LIMIT,
  type PendingWorkItem,
} from "./admin-overview-helpers";

export function PendingWorkList({
  loading,
  error,
  failedImageCount,
  comicTasks,
  alerts,
}: Readonly<{
  loading: boolean;
  error: unknown;
  failedImageCount: number;
  comicTasks: readonly AdminComicTask[];
  alerts: readonly { code: string; message: string; count: number; threshold: number }[];
}>) {
  if (loading) {
    return <LoadingState title="正在汇总待处理事项" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取待处理事项失败")} />;
  }
  const items = buildPendingItems(failedImageCount, comicTasks, alerts);
  if (items.length === 0) {
    return <EmptyState title="暂无待处理事项" description="当前没有明显的失败任务或 worker 告警。" />;
  }
  return <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{items.map((item) => <PendingItemCard key={item.href + item.label} item={item} />)}</div>;
}

export function FailedImageJobList({
  loading,
  error,
  jobs,
}: Readonly<{
  loading: boolean;
  error: unknown;
  jobs: readonly AdminImageJob[];
}>) {
  if (loading) {
    return <LoadingState title="正在读取失败图片任务" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取失败图片任务失败")} />;
  }
  const recentJobs = jobs.slice(0, PREVIEW_LIMIT);
  if (!recentJobs.length) {
    return <EmptyState title="暂无失败图片任务" description="当前没有失败的图片任务需要处理。" />;
  }
  return <div className="grid gap-2">{recentJobs.map((job) => <ImageJobRow key={job.id} job={job} />)}</div>;
}

export function FailedComicTaskList({
  loading,
  error,
  tasks,
}: Readonly<{
  loading: boolean;
  error: unknown;
  tasks: readonly AdminComicTask[];
}>) {
  if (loading) {
    return <LoadingState title="正在读取失败漫画任务" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取失败漫画任务失败")} />;
  }
  const recentTasks = tasks.filter((task) => task.status === "failed").slice(0, PREVIEW_LIMIT);
  if (!recentTasks.length) {
    return <EmptyState title="暂无失败漫画任务" description="当前没有失败的漫画任务需要排查。" />;
  }
  return <div className="grid gap-2">{recentTasks.map((task) => <ComicTaskRow key={task.id} task={task} />)}</div>;
}

export function QuickActionCard({ item }: Readonly<{ item: { href: string; label: string; detail: string; token: string } }>) {
  return (
    <Link href={item.href} className="admin-card flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-gray-950">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{item.detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-gray-400">进入</span>
    </Link>
  );
}

function PendingItemCard({ item }: Readonly<{ item: PendingWorkItem }>) {
  const tone = item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : "neutral";
  return (
    <Link href={item.href} className="admin-card flex min-h-[90px] flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-950">{item.label}</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500">{item.detail}</p>
        </div>
        <StatusPill status={item.tone} tone={tone} label={item.toneLabel} />
      </div>
      <p className="text-[11px] text-gray-400">{item.hint}</p>
    </Link>
  );
}

function ImageJobRow({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <Link href="/admin/image-jobs" className="admin-list-row text-gray-700 hover:text-gray-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{job.model_code} · {formatJobSource(job.source)}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {job.error_message || job.error_code ? formatJobErrorText(job.error_code, job.error_message) : job.prompt}
        </span>
      </span>
      <span className="shrink-0 text-xs text-gray-400">{formatDateTime(job.created_at)}</span>
    </Link>
  );
}

function ComicTaskRow({ task }: Readonly<{ task: AdminComicTask }>) {
  return (
    <Link href="/admin/comic-jobs" className="admin-list-row text-gray-700 hover:text-gray-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{formatComicTaskTypeLabel(task.task_type)} · {formatComicStageLabel(task.stage)}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {task.error_message || task.error_code ? formatJobErrorText(task.error_code, task.error_message) : `进度 ${task.progress_percent}%`}
        </span>
      </span>
      <span className="shrink-0 text-xs text-gray-400">{formatDateTime(task.created_at)}</span>
    </Link>
  );
}
