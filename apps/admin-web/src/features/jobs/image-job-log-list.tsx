import Image from "next/image";

import { StatusPill } from "@/features/ui/status-pill";
import type { WorkerSummary } from "@/lib/admin-api";
import type { AdminImageJob, AdminImageJobResult } from "@/lib/admin-image-job-types";

import { formatJobCents, formatJobDateTime, formatJobDuration, formatJobOwner, formatJobQuality, formatJobSize } from "./image-job-format";

type LogListProps = Readonly<{
  jobs: readonly AdminImageJob[];
  loading: boolean;
  summary: WorkerSummary | null;
}>;

type DetailItem = Readonly<{
  label: string;
  value: string;
  tone?: "danger" | "success";
}>;

export function ImageJobLogList({ jobs, loading, summary }: LogListProps) {
  return (
    <section className="admin-panel image-job-log-panel">
      <LogHeader jobs={jobs} loading={loading} summary={summary} />
      <div className="image-job-log-list">
        <LogRows jobs={jobs} loading={loading} />
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

function LogRows({ jobs, loading }: Readonly<{ jobs: readonly AdminImageJob[]; loading: boolean }>) {
  if (loading && jobs.length === 0) {
    return <p className="image-job-empty">正在读取图片任务。</p>;
  }
  if (jobs.length === 0) {
    return <p className="image-job-empty">暂无图片任务。</p>;
  }
  return jobs.map((job) => <ImageJobLogRow job={job} key={job.id} />);
}

function ImageJobLogRow({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <article className="image-job-log-row">
      <PromptCell job={job} />
      <DetailCell job={job} />
      <PreviewCell job={job} />
    </article>
  );
}

function PromptCell({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="image-job-prompt-cell">
      <div className="image-job-row-kicker">
        <strong>#{job.id}</strong>
        <StatusPill status={job.status} />
        <span>{formatJobDateTime(job.created_at)}</span>
      </div>
      <p className="image-job-prompt-preview">{job.prompt}</p>
      {job.error_code || job.error_message ? (
        <p className="image-job-inline-error">{job.error_code ?? "unknown"} · {job.error_message ?? "无错误详情"}</p>
      ) : null}
    </div>
  );
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
      <span>{total} 张 · Asset #{result.asset_id}</span>
    </a>
  );
}

function PreviewPlaceholder({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="image-job-preview-empty">
      <strong>{job.status}</strong>
      <span>{job.finished_at ? "无结果图" : "等待结果"}</span>
    </div>
  );
}

function buildDetailItems(job: AdminImageJob): readonly DetailItem[] {
  const margin = buildMarginItem(job);
  return [
    { label: "用户", value: formatJobOwner(job.user_id) },
    { label: "模型", value: job.model_code },
    { label: "上游", value: job.provider_model ?? "未绑定" },
    { label: "尺寸", value: formatJobSize(job.size) },
    { label: "画质", value: formatJobQuality(job.quality) },
    { label: "数量", value: String(job.requested_count) },
    { label: "扣费", value: formatJobCents(job.charge_cents), tone: "success" },
    { label: "成本", value: formatNullableCents(job.internal_cost_cents) },
    margin,
    { label: "Token", value: formatJobTokens(job) },
    { label: "耗时", value: formatJobDuration(job.started_at, job.finished_at) },
    { label: "尝试", value: `${job.attempt_count}/${job.max_attempts}` },
  ];
}

function buildMarginItem(job: AdminImageJob): DetailItem {
  if (job.internal_cost_cents === null) {
    return { label: "毛利", value: "未记录" };
  }
  const marginCents = job.charge_cents - job.internal_cost_cents;
  return { label: "毛利", value: formatJobCents(marginCents), tone: marginCents >= 0 ? "success" : "danger" };
}

function formatNullableCents(value: number | null): string {
  return value === null ? "未记录" : formatJobCents(value);
}

function formatJobTokens(job: AdminImageJob): string {
  if (job.provider_total_tokens === null) return "未记录";
  return `${job.provider_input_tokens ?? 0}/${job.provider_output_tokens ?? 0}/${job.provider_total_tokens}`;
}
