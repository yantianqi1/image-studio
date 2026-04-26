"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi, type WorkerSummary } from "@/lib/admin-api";

export function ImageJobsPage() {
  const [jobs, setJobs] = useState<
    readonly {
      id: number;
      prompt: string;
      status: string;
      source: string;
      created_at: string;
    }[]
  >([]);
  const [summary, setSummary] = useState<WorkerSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminApi.imageJobs(), adminApi.workerSummary()])
      .then(([nextJobs, nextSummary]) => {
        setJobs(nextJobs);
        setSummary(nextSummary);
      })
      .catch((nextError) => {
        setError(
          nextError instanceof Error ? nextError.message : "读取图片任务失败",
        );
      });
  }, []);

  return (
    <AdminShell
      title="图片任务"
      description="查看图片任务状态和来源，排查失败任务与匿名调用。"
    >
      <div className="col-span-12 xl:col-span-4 grid gap-4 content-start">
        <Panel
          title="队列观测"
          description="/api/admin/ops/worker-summary"
        >
          {summary ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="admin-card text-center">
                <p className="text-2xl font-bold text-gray-900">{summary.image_jobs.queued}</p>
                <p className="text-xs text-gray-400 mt-0.5">排队中</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-2xl font-bold text-blue-600">{summary.image_jobs.running}</p>
                <p className="text-xs text-gray-400 mt-0.5">运行中</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-2xl font-bold text-emerald-600">{summary.image_jobs.succeeded}</p>
                <p className="text-xs text-gray-400 mt-0.5">成功</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-2xl font-bold text-red-600">{summary.image_jobs.failed}</p>
                <p className="text-xs text-gray-400 mt-0.5">失败</p>
              </div>
              <div className="admin-card text-center col-span-2">
                <p className="text-2xl font-bold text-amber-600">{summary.image_jobs.stale_running}</p>
                <p className="text-xs text-gray-400 mt-0.5">stale ({summary.image_jobs.stale_after_seconds}s)</p>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="col-span-12 xl:col-span-8 grid gap-4 content-start">
        <Panel title="告警" description="worker 状态告警">
          {summary?.alerts.length ? (
            <div className="grid gap-2">
              {summary.alerts.map((alert) => (
                <div
                  key={alert.code}
                  className="admin-card border-amber-200 bg-amber-50/50 text-amber-900 text-sm"
                >
                  <span className="font-semibold">{alert.code}</span> · {alert.message}
                </div>
              ))}
            </div>
          ) : null}
          {!summary?.alerts.length && summary ? (
            <div className="admin-card text-gray-400 text-sm">
              当前没有触发中的 worker 告警。
            </div>
          ) : null}
        </Panel>

        <Panel title="任务列表" description="/api/admin/image/jobs">
          {error ? <ErrorBox message={error} /> : null}
          <div className="grid gap-2">
            {jobs.map((job) => (
              <div key={job.id} className="admin-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">#{job.id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    job.status === "succeeded" ? "bg-emerald-50 text-emerald-600" :
                    job.status === "failed" ? "bg-red-50 text-red-600" :
                    job.status === "running" ? "bg-blue-50 text-blue-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {job.status}
                  </span>
                </div>
                <p className="text-sm mt-1 truncate font-medium">{job.prompt}</p>
                <p className="text-xs text-gray-400 mt-0.5">{job.source} · {job.created_at}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
