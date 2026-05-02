import { StatusPill } from "@/features/ui/status-pill";
import type { WorkerSummary } from "@/lib/admin-api";
import type { AdminImageJob } from "@/lib/admin-image-job-types";

import { buildPromptPreview, formatJobDateTime, formatJobOwner } from "./image-job-format";

type ImageJobSidebarProps = Readonly<{
  jobs: readonly AdminImageJob[];
  loading: boolean;
  selectedJobId: number | null;
  summary: WorkerSummary | null;
  onSelectJob: (jobId: number) => void;
}>;

type QueueMetric = Readonly<{
  label: string;
  value: number;
  tone: string;
}>;

export function ImageJobSidebar(props: ImageJobSidebarProps) {
  return (
    <aside className="image-jobs-sidebar">
      <QueueSummary summary={props.summary} />
      <AlertSummary summary={props.summary} />
      <TaskIndex
        jobs={props.jobs}
        loading={props.loading}
        selectedJobId={props.selectedJobId}
        onSelectJob={props.onSelectJob}
      />
    </aside>
  );
}

function QueueSummary({ summary }: Readonly<{ summary: WorkerSummary | null }>) {
  return (
    <section className="admin-panel image-job-side-panel">
      <PanelTitle title="队列" description="/api/admin/ops/worker-summary" />
      {summary ? (
        <div className="image-job-metrics">
          {buildQueueMetrics(summary).map((metric) => (
            <div className="image-job-metric" data-tone={metric.tone} key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="image-job-muted">正在读取队列状态。</p>
      )}
    </section>
  );
}

function AlertSummary({ summary }: Readonly<{ summary: WorkerSummary | null }>) {
  const alerts = summary?.alerts ?? [];
  return (
    <section className="admin-panel image-job-side-panel">
      <PanelTitle title="告警" description="worker 运行状态" />
      {alerts.length > 0 ? (
        <div className="image-job-alerts">
          {alerts.map((alert) => (
            <p className="image-job-alert" key={alert.code}>
              <strong>{alert.code}</strong>
              <span>{alert.message}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="image-job-muted">{summary ? "当前没有触发中的 worker 告警。" : "正在读取告警。"}</p>
      )}
    </section>
  );
}

function TaskIndex(props: Readonly<{
  jobs: readonly AdminImageJob[];
  loading: boolean;
  selectedJobId: number | null;
  onSelectJob: (jobId: number) => void;
}>) {
  return (
    <section className="admin-panel image-job-task-panel">
      <PanelTitle title={`任务日志 (${props.jobs.length})`} description="/api/admin/image/jobs" />
      <div className="image-job-task-list">
        <TaskListContent {...props} />
      </div>
    </section>
  );
}

function TaskListContent(props: Readonly<{
  jobs: readonly AdminImageJob[];
  loading: boolean;
  selectedJobId: number | null;
  onSelectJob: (jobId: number) => void;
}>) {
  if (props.loading && props.jobs.length === 0) {
    return <p className="image-job-empty">正在读取图片任务。</p>;
  }
  if (props.jobs.length === 0) {
    return <p className="image-job-empty">暂无图片任务。</p>;
  }
  return props.jobs.map((job) => (
    <TaskRow
      active={props.selectedJobId === job.id}
      job={job}
      key={job.id}
      onSelect={() => props.onSelectJob(job.id)}
    />
  ));
}

function TaskRow({ active, job, onSelect }: Readonly<{
  active: boolean;
  job: AdminImageJob;
  onSelect: () => void;
}>) {
  return (
    <button
      aria-pressed={active}
      className={active ? "image-job-row image-job-row-active" : "image-job-row"}
      type="button"
      onClick={onSelect}
    >
      <span className="image-job-row-top">
        <span>#{job.id}</span>
        <StatusPill status={job.status} />
      </span>
      <span className="image-job-row-prompt">{buildPromptPreview(job.prompt)}</span>
      <span className="image-job-row-meta">
        {job.model_code} · {formatJobOwner(job.user_id)}
      </span>
      <span className="image-job-row-foot">
        <span>{formatJobDateTime(job.finished_at ?? job.created_at)}</span>
        <span>{job.results.length > 0 ? `${job.results.length} 张图` : "暂无图片"}</span>
      </span>
    </button>
  );
}

function PanelTitle({ title, description }: Readonly<{ title: string; description: string }>) {
  return (
    <div className="image-job-panel-title">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function buildQueueMetrics(summary: WorkerSummary): readonly QueueMetric[] {
  return [
    { label: "排队", value: summary.image_jobs.queued, tone: "neutral" },
    { label: "运行", value: summary.image_jobs.running, tone: "info" },
    { label: "成功", value: summary.image_jobs.succeeded, tone: "success" },
    { label: "失败", value: summary.image_jobs.failed, tone: "danger" },
    { label: `stale ${summary.image_jobs.stale_after_seconds}s`, value: summary.image_jobs.stale_running, tone: "warning" },
  ];
}
