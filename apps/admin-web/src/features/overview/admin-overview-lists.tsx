"use client";

import Link from "next/link";

import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import { StatusPill } from "@/features/ui/status-pill";
import type { AdminAuditLog, AdminRedeemBatchSummary } from "@/lib/admin-api";
import type { AdminImageJob } from "@/lib/admin-image-job-types";
import type { AdminComicTask } from "@/lib/use-admin-data";
import { errorMessage, formatCredits, formatDateTime } from "@/features/users/user-format";
import {
  buildPendingItems,
  LARGE_WALLET_ADJUSTMENT_CREDITS,
  PREVIEW_LIMIT,
  readAmountCents,
  SITE_CREDIT_CENTS,
  type PendingWorkItem,
} from "./admin-overview-helpers";

export function PendingWorkList({
  loading,
  error,
  failedImageCount,
  comicTasks,
  alerts,
  walletAdjustments,
  redeemBatches,
}: Readonly<{
  loading: boolean;
  error: unknown;
  failedImageCount: number;
  comicTasks: readonly AdminComicTask[];
  alerts: readonly { code: string; message: string; count: number; threshold: number }[];
  walletAdjustments: readonly AdminAuditLog[];
  redeemBatches: readonly AdminRedeemBatchSummary[];
}>) {
  if (loading) {
    return <LoadingState title="正在汇总待处理事项" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取待处理事项失败")} />;
  }
  const items = buildPendingItems(failedImageCount, comicTasks, alerts, walletAdjustments, redeemBatches);
  if (items.length === 0) {
    return <EmptyState title="暂无待处理事项" description="当前没有明显的失败任务、告警或异常调账。" />;
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

export function RedeemBatchList({
  loading,
  error,
  batches,
}: Readonly<{
  loading: boolean;
  error: unknown;
  batches: readonly AdminRedeemBatchSummary[];
}>) {
  if (loading) {
    return <LoadingState title="正在读取兑换码批次" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取兑换码批次失败")} />;
  }
  const recentBatches = [...batches].slice(-PREVIEW_LIMIT).reverse();
  if (!recentBatches.length) {
    return <EmptyState title="暂无兑换码批次" description="当前还没有后台创建的兑换码批次。" />;
  }
  return <div className="grid gap-2">{recentBatches.map((batch) => <RedeemBatchRow key={batch.id} batch={batch} />)}</div>;
}

export function WalletAdjustmentList({
  loading,
  error,
  logs,
}: Readonly<{
  loading: boolean;
  error: unknown;
  logs: readonly AdminAuditLog[];
}>) {
  if (loading) {
    return <LoadingState title="正在读取钱包调账" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取钱包调账失败")} />;
  }
  const recentLogs = [...logs].slice(-PREVIEW_LIMIT).reverse();
  if (!recentLogs.length) {
    return <EmptyState title="暂无钱包调账记录" description="当前没有管理员调账审计。" />;
  }
  return <div className="grid gap-2">{recentLogs.map((log) => <WalletAdjustmentRow key={log.id} log={log} />)}</div>;
}

export function QuickActionCard({ item }: Readonly<{ item: { href: string; label: string; detail: string; token: string } }>) {
  return (
    <Link href={item.href} className="admin-card flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-gray-950">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{item.detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-gray-400">{item.token}</span>
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
        <span className="block truncate text-sm font-semibold">{job.model_code} · {job.source}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{job.error_message || job.error_code || job.prompt}</span>
      </span>
      <span className="shrink-0 text-xs text-gray-400">{formatDateTime(job.created_at)}</span>
    </Link>
  );
}

function ComicTaskRow({ task }: Readonly<{ task: AdminComicTask }>) {
  return (
    <Link href="/admin/comic-jobs" className="admin-list-row text-gray-700 hover:text-gray-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{task.task_type} · {task.stage}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{task.error_message || task.error_code || `进度 ${task.progress_percent}%`}</span>
      </span>
      <span className="shrink-0 text-xs text-gray-400">{formatDateTime(task.created_at)}</span>
    </Link>
  );
}

function RedeemBatchRow({ batch }: Readonly<{ batch: AdminRedeemBatchSummary }>) {
  return (
    <Link href="/admin/redeem" className="admin-list-row text-gray-700 hover:text-gray-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{batch.name}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {batch.credit_amount_credits} 额度 · {batch.redeemed_quantity}/{batch.quantity} 已兑换
        </span>
      </span>
      <StatusPill status={batch.status} />
    </Link>
  );
}

function WalletAdjustmentRow({ log }: Readonly<{ log: AdminAuditLog }>) {
  const amountCents = readAmountCents(log);
  const amountLabel = amountCents === null ? "未知额度" : `${amountCents >= 0 ? "+" : ""}${formatCredits(amountCents / SITE_CREDIT_CENTS)}`;
  const isLargeAdjustment = amountCents !== null && Math.abs(amountCents) >= LARGE_WALLET_ADJUSTMENT_CREDITS * SITE_CREDIT_CENTS;
  return (
    <Link href="/admin/audit" className="admin-list-row text-gray-700 hover:text-gray-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{amountLabel} · #{log.target_id}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{log.reason}</span>
      </span>
      <StatusPill status={isLargeAdjustment ? "warning" : "neutral"} tone={isLargeAdjustment ? "warning" : "neutral"} label={formatDateTime(log.created_at)} />
    </Link>
  );
}
