"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi, type WorkerSummary } from "@/lib/admin-api";
import type { AdminImageJob, AdminImageJobResult } from "@/lib/admin-image-job-types";

export function ImageJobsPage() {
  const [jobs, setJobs] = useState<readonly AdminImageJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [summary, setSummary] = useState<WorkerSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminApi.imageJobs(), adminApi.workerSummary()])
      .then(([nextJobs, nextSummary]) => {
        setJobs(nextJobs);
        setSummary(nextSummary);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "读取图片任务失败");
      });
  }, []);

  function toggleJob(jobId: number) {
    setExpandedJobId((current) => (current === jobId ? null : jobId));
  }

  return (
    <AdminShell title="图片任务" description="查看图片任务状态、提示词、结果图与供应商返回信息。">
      <div className="col-span-12 xl:col-span-4 grid gap-4 content-start">
        <QueuePanel summary={summary} />
      </div>
      <div className="col-span-12 xl:col-span-8 grid gap-4 content-start">
        <AlertsPanel summary={summary} />
        <Panel title="任务日志" description="/api/admin/image/jobs">
          {error ? <ErrorBox message={error} /> : null}
          <JobList jobs={jobs} expandedJobId={expandedJobId} onToggle={toggleJob} />
        </Panel>
      </div>
    </AdminShell>
  );
}

function QueuePanel({ summary }: Readonly<{ summary: WorkerSummary | null }>) {
  return (
    <Panel title="队列观测" description="/api/admin/ops/worker-summary">
      {summary ? (
        <div className="grid grid-cols-2 gap-2">
          <QueueMetric label="排队中" value={summary.image_jobs.queued} className="text-gray-900" />
          <QueueMetric label="运行中" value={summary.image_jobs.running} className="text-blue-600" />
          <QueueMetric label="成功" value={summary.image_jobs.succeeded} className="text-emerald-600" />
          <QueueMetric label="失败" value={summary.image_jobs.failed} className="text-red-600" />
          <QueueMetric
            label={`stale (${summary.image_jobs.stale_after_seconds}s)`}
            value={summary.image_jobs.stale_running}
            className="text-amber-600"
            wide
          />
        </div>
      ) : null}
    </Panel>
  );
}

function QueueMetric(props: Readonly<{ label: string; value: number; className: string; wide?: boolean }>) {
  return (
    <div className={`admin-card text-center ${props.wide ? "col-span-2" : ""}`}>
      <p className={`text-2xl font-bold ${props.className}`}>{props.value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{props.label}</p>
    </div>
  );
}

function AlertsPanel({ summary }: Readonly<{ summary: WorkerSummary | null }>) {
  return (
    <Panel title="告警" description="worker 状态告警">
      {summary?.alerts.length ? (
        <div className="grid gap-2">
          {summary.alerts.map((alert) => (
            <div key={alert.code} className="admin-card border-amber-200 bg-amber-50/50 text-amber-900 text-sm">
              <span className="font-semibold">{alert.code}</span> · {alert.message}
            </div>
          ))}
        </div>
      ) : null}
      {!summary?.alerts.length && summary ? (
        <div className="admin-card text-gray-400 text-sm">当前没有触发中的 worker 告警。</div>
      ) : null}
    </Panel>
  );
}

function JobList(props: Readonly<{
  jobs: readonly AdminImageJob[];
  expandedJobId: number | null;
  onToggle: (jobId: number) => void;
}>) {
  if (props.jobs.length === 0) {
    return <div className="admin-card text-sm text-gray-400">暂无图片任务。</div>;
  }
  return (
    <div className="grid gap-2">
      {props.jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          expanded={props.expandedJobId === job.id}
          onToggle={() => props.onToggle(job.id)}
        />
      ))}
    </div>
  );
}

function JobCard({ job, expanded, onToggle }: Readonly<{ job: AdminImageJob; expanded: boolean; onToggle: () => void }>) {
  return (
    <article className="admin-card">
      <button className="w-full text-left" type="button" onClick={onToggle} aria-expanded={expanded}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400">#{job.id} · {job.source} · {job.mode}</span>
          <StatusPill status={job.status} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium text-gray-900">{job.prompt}</p>
        <p className="mt-1 text-xs text-gray-400">{job.model_code} · {job.created_at}</p>
      </button>
      {expanded ? <JobDetails job={job} /> : null}
    </article>
  );
}

function StatusPill({ status }: Readonly<{ status: string }>) {
  const className = status === "succeeded" ? "bg-emerald-50 text-emerald-600"
    : status === "failed" ? "bg-red-50 text-red-600"
      : status === "running" ? "bg-blue-50 text-blue-600"
        : "bg-gray-100 text-gray-500";
  return <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>{status}</span>;
}

function JobDetails({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="mt-4 border-t border-white/70 pt-4">
      <div className="grid gap-3 text-sm">
        <DetailBlock label="完整提示词" value={job.prompt} />
        {job.error_code || job.error_message ? <ErrorDetail job={job} /> : null}
        <JobMeta job={job} />
        <ResultGrid results={job.results} />
      </div>
    </div>
  );
}

function DetailBlock({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-gray-900">{value}</p>
    </div>
  );
}

function ErrorDetail({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/70 p-3 text-red-700">
      <p className="text-xs font-semibold">失败信息</p>
      <p className="mt-1 break-words">{job.error_code ?? "unknown"} · {job.error_message ?? "无错误详情"}</p>
    </div>
  );
}

function JobMeta({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
      <span>用户：{job.user_id ?? "匿名 / 客户端"}</span>
      <span>数量：{job.requested_count}</span>
      <span>尝试：{job.attempt_count}/{job.max_attempts}</span>
      <span>扣费：{job.charge_cents} cents</span>
      <span>Provider：{job.provider_model ?? "未绑定"}</span>
      <span>完成：{job.finished_at ?? "未完成"}</span>
    </div>
  );
}

function ResultGrid({ results }: Readonly<{ results: readonly AdminImageJobResult[] }>) {
  if (results.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">暂无结果图片。</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {results.map((result) => (
        <ResultItem key={result.id} result={result} />
      ))}
    </div>
  );
}

function ResultItem({ result }: Readonly<{ result: AdminImageJobResult }>) {
  return (
    <figure className="overflow-hidden rounded-lg border border-white/80 bg-white/60">
      <a href={result.asset_url} target="_blank" rel="noreferrer">
        <img className="aspect-square w-full object-cover" src={result.asset_url} alt={`图片任务结果 ${result.result_index}`} />
      </a>
      <figcaption className="grid gap-1 p-3 text-xs text-gray-500">
        <span>Result #{result.result_index}</span>
        <span className="break-words">Provider Request：{result.provider_request_id ?? "无"}</span>
        {result.revised_prompt ? <span className="break-words">修订提示词：{result.revised_prompt}</span> : null}
      </figcaption>
    </figure>
  );
}
