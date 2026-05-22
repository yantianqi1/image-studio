import Image from "next/image";

import { StatusPill } from "@/features/ui/status-pill";
import { adminApi } from "@/lib/admin-api";
import type { WorkerSummary } from "@/lib/admin-api";
import type { AdminImageJob, AdminImageJobResult } from "@/lib/admin-image-job-types";

import {
  formatJobDateTime,
  formatJobDuration,
  formatJobErrorText,
  formatJobOwner,
  formatJobQuality,
  formatJobSize,
  formatJobSource,
  formatJobStatus,
} from "./image-job-format";

type LogListProps = Readonly<{
  jobs: readonly AdminImageJob[];
  loading: boolean;
  summary: WorkerSummary | null;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>;

type DetailItem = Readonly<{
  label: string;
  value: string;
  tone?: "danger" | "success";
}>;

export function ImageJobLogList({ jobs, loading, onChanged, onError, summary }: LogListProps) {
  return (
    <section className="admin-panel image-job-log-panel">
      <LogHeader
        jobs={jobs}
        loading={loading}
        onChanged={onChanged}
        onError={onError}
        summary={summary}
      />
      <div className="image-job-log-list">
        <LogRows jobs={jobs} loading={loading} onChanged={onChanged} onError={onError} />
      </div>
    </section>
  );
}

function LogHeader({ jobs, loading, summary }: LogListProps) {
  return (
    <div className="image-job-log-header">
      <div>
        <h2>任务日志</h2>
        <p>{loading ? "正在刷新" : `当前页 ${jobs.length} 条`}</p>
      </div>
      {summary ? <QueueStrip summary={summary} /> : null}
    </div>
  );
}

function QueueStrip({ summary }: Readonly<{ summary: WorkerSummary }>) {
  const jobSummary = summary.image_jobs;
  return (
    <div className="image-job-queue-strip">
      <span>排队 {jobSummary.queued}</span>
      <span>运行 {jobSummary.running}</span>
      <span>成功 {jobSummary.succeeded}</span>
      <span>失败 {jobSummary.failed}</span>
      <span>超时 {jobSummary.stale_running}</span>
    </div>
  );
}

function LogRows({
  jobs,
  loading,
  onChanged,
  onError,
}: Readonly<{
  jobs: readonly AdminImageJob[];
  loading: boolean;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  if (loading && jobs.length === 0) {
    return <p className="image-job-empty">正在读取图片任务。</p>;
  }
  if (jobs.length === 0) {
    return <p className="image-job-empty">暂无图片任务。</p>;
  }
  return jobs.map((job) => (
    <ImageJobLogRow job={job} key={job.id} onChanged={onChanged} onError={onError} />
  ));
}

function ImageJobLogRow({
  job,
  onChanged,
  onError,
}: Readonly<{
  job: AdminImageJob;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  return (
    <article className="image-job-log-row">
      <PromptCell job={job} onChanged={onChanged} onError={onError} />
      <DetailCell job={job} />
      <PreviewCell job={job} />
    </article>
  );
}

function PromptCell({
  job,
  onChanged,
  onError,
}: Readonly<{
  job: AdminImageJob;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  return (
    <div className="image-job-prompt-cell">
      <div className="image-job-row-kicker">
        <strong>#{job.id}</strong>
        <StatusPill status={job.status} />
        <span>{formatJobDateTime(job.created_at)}</span>
      </div>
      <p className="image-job-prompt-preview">{job.prompt}</p>
      {job.error_code || job.error_message ? (
        <p className="image-job-inline-error">错误：{formatJobErrorText(job.error_code, job.error_message)}</p>
      ) : null}
      <JobActions job={job} onChanged={onChanged} onError={onError} />
    </div>
  );
}

function JobActions({
  job,
  onChanged,
  onError,
}: Readonly<{
  job: AdminImageJob;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  if (!canRetryJob(job) && !canCancelJob(job)) return null;
  return (
    <div className="image-job-row-actions">
      {canRetryJob(job) ? <JobActionButton job={job} kind="retry" onChanged={onChanged} onError={onError} /> : null}
      {canCancelJob(job) ? <JobActionButton job={job} kind="cancel" onChanged={onChanged} onError={onError} /> : null}
    </div>
  );
}

function JobActionButton({
  job,
  kind,
  onChanged,
  onError,
}: Readonly<{
  job: AdminImageJob;
  kind: "retry" | "cancel";
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  const label = kind === "retry" ? "重试任务" : "取消任务";
  return (
    <button
      className="admin-button image-job-action-button"
      type="button"
      onClick={async () => {
        try {
          if (kind === "retry") await adminApi.retryImageJob(job.id);
          if (kind === "cancel") await adminApi.cancelImageJob(job.id);
          await onChanged(`图片任务 #${job.id} 已${kind === "retry" ? "重试" : "取消"}`);
        } catch (error) {
          onError(error instanceof Error ? error.message : `${label}失败`);
        }
      }}
    >
      {label}
    </button>
  );
}

function canRetryJob(job: AdminImageJob): boolean {
  return job.status === "failed" || job.status === "cancelled";
}

function canCancelJob(job: AdminImageJob): boolean {
  return job.status === "queued" || job.status === "running";
}

function DetailCell({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <dl className="image-job-compact-details">
      {buildDetailItems(job).map((item) => (
        <div data-tone={item.tone} key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PreviewCell({ job }: Readonly<{ job: AdminImageJob }>) {
  const result = job.results[0] ?? null;
  return (
    <div className="image-job-preview-cell">
      {result ? <ResultPreview result={result} total={job.results.length} /> : <PreviewPlaceholder job={job} />}
    </div>
  );
}

function ResultPreview({ result, total }: Readonly<{ result: AdminImageJobResult; total: number }>) {
  return (
    <a className="image-job-preview-link" href={result.asset_url} target="_blank" rel="noreferrer">
      <Image
        alt={`图片任务结果 ${result.result_index}`}
        height={104}
        loading="lazy"
        src={result.thumbnail_url}
        unoptimized
        width={154}
      />
      <span>{total} 张 · 资产 #{result.asset_id}</span>
    </a>
  );
}

function PreviewPlaceholder({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="image-job-preview-empty">
      <strong>{formatJobStatus(job.status)}</strong>
      <span>{job.finished_at ? "无结果图" : "等待结果"}</span>
    </div>
  );
}

function buildDetailItems(job: AdminImageJob): readonly DetailItem[] {
  return [
    { label: "用户", value: formatJobOwner(job.user_id) },
    { label: "模型", value: job.model_code },
    { label: "来源", value: formatJobSource(job.source) },
    { label: "上游", value: job.provider_model ?? "未绑定" },
    { label: "尺寸", value: formatJobSize(job.size) },
    { label: "画质", value: formatJobQuality(job.quality) },
    { label: "数量", value: String(job.requested_count) },
    { label: "上游成本", value: formatNullableCents(job.raw_provider_cost_cents) },
    { label: "中转费用", value: formatNullableCents(job.provider_fee_cents) },
    { label: "内部成本", value: formatNullableCents(job.internal_cost_cents) },
    { label: "令牌", value: formatJobTokens(job) },
    { label: "耗时", value: formatJobDuration(job.started_at, job.finished_at) },
    { label: "尝试", value: `${job.attempt_count}/${job.max_attempts}` },
  ];
}

function formatNullableCents(value: number | null): string {
  return value === null ? "未记录" : `¥${(value / 100).toFixed(2)}`;
}

function formatJobTokens(job: AdminImageJob): string {
  if (job.provider_total_tokens === null) return "未记录";
  return `${job.provider_input_tokens ?? 0}/${job.provider_output_tokens ?? 0}/${job.provider_total_tokens}`;
}
