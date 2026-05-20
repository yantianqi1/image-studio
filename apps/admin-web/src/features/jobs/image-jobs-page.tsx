"use client";

import { useState } from "react";

import "@/features/jobs/image-jobs.css";
import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { useAdminJobs, useWorkerSummary } from "@/lib/use-admin-data";

import { ImageJobLogList } from "./image-job-log-list";
import { ImageJobStatsPanel } from "./image-job-stats";

type Tab = "logs" | "stats";
type StatusFilter = "" | "queued" | "running" | "succeeded" | "failed";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "全部" },
  { key: "queued", label: "排队" },
  { key: "running", label: "运行中" },
  { key: "succeeded", label: "成功" },
  { key: "failed", label: "失败" },
];

export function ImageJobsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);

  const { data: jobsData, error: jobsError, isLoading: jobsLoading, mutate: mutateJobs } = useAdminJobs({
    page,
    page_size: 50,
    status: statusFilter || undefined,
  });
  const { data: summary } = useWorkerSummary();

  const jobs = jobsData?.items ?? [];
  const totalJobs = jobsData?.total ?? 0;
  const totalPages = Math.ceil(totalJobs / 50);

  const error = jobsError instanceof Error ? jobsError.message : jobsError ? "读取图片任务失败" : "";

  return (
    <AdminShell
      title="图片任务"
      description="按提示词、参数、上游成本和结果图逐条审阅生成记录。"
      actions={<RefreshButton loading={jobsLoading} onRefresh={() => mutateJobs()} />}
    >
      <div className="col-span-12 grid gap-4">
        <TabBar active={activeTab} onChange={setActiveTab} />
        {error ? <ErrorBox message={error} /> : null}

        {activeTab === "logs" && (
          <>
            <StatusFilterBar active={statusFilter} onChange={(s) => { setStatusFilter(s); setPage(1); }} />
            <ImageJobLogList jobs={jobs} loading={jobsLoading} summary={summary ?? null} />
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button className="admin-button" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
                <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                <button className="admin-button" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
              </div>
            )}
          </>
        )}

        {activeTab === "stats" && <ImageJobStatsPanel />}
      </div>
    </AdminShell>
  );
}

function StatusFilterBar({ active, onChange }: { active: StatusFilter; onChange: (s: StatusFilter) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
      {STATUS_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
            active === f.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "logs", label: "任务日志" },
    { key: "stats", label: "统计监控" },
  ];
  return (
    <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            active === tab.key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function RefreshButton({ loading, onRefresh }: Readonly<{
  loading: boolean;
  onRefresh: () => void;
}>) {
  return (
    <div className="image-jobs-toolbar">
      <span>自动刷新 5 秒</span>
      <button className="admin-button" disabled={loading} type="button" onClick={onRefresh}>
        {loading ? "刷新中" : "刷新"}
      </button>
    </div>
  );
}
