"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { adminApi, type WorkerSummary } from "@/lib/admin-api";
import type { AdminImageJob } from "@/lib/admin-image-job-types";

import { ImageJobDetail } from "./image-job-detail";
import { ImageJobResults } from "./image-job-results";
import { ImageJobSidebar } from "./image-job-sidebar";
import { ImageJobStatsPanel } from "./image-job-stats";

type Tab = "logs" | "stats";

export function ImageJobsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [jobs, setJobs] = useState<readonly AdminImageJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [summary, setSummary] = useState<WorkerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextJobs, nextSummary] = await Promise.all([
        adminApi.imageJobs(),
        adminApi.workerSummary(),
      ]);
      setJobs(nextJobs);
      setSummary(nextSummary);
      setSelectedJobId((current) => resolveSelectedJobId(current, nextJobs));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "读取图片任务失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AdminShell
      title="图片任务"
      description="按任务索引、完整提示词和结果图拆分视图，便于快速审阅生成记录。"
      actions={<RefreshButton loading={loading} onRefresh={loadData} />}
    >
      <div className="col-span-12 grid gap-4">
        <TabBar active={activeTab} onChange={setActiveTab} />
        {error ? <ErrorBox message={error} /> : null}

        {activeTab === "logs" && (
          <div className="image-jobs-workbench">
            <ImageJobSidebar
              jobs={jobs}
              loading={loading}
              selectedJobId={selectedJobId}
              summary={summary}
              onSelectJob={setSelectedJobId}
            />
            <ImageJobDetail job={selectedJob} />
            <ImageJobResults job={selectedJob} />
          </div>
        )}

        {activeTab === "stats" && <ImageJobStatsPanel />}
      </div>
    </AdminShell>
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
    <button className="admin-button image-jobs-toolbar" disabled={loading} type="button" onClick={onRefresh}>
      {loading ? "刷新中" : "刷新"}
    </button>
  );
}

function resolveSelectedJobId(
  currentId: number | null,
  jobs: readonly AdminImageJob[],
) {
  if (jobs.length === 0) {
    return null;
  }
  if (currentId !== null && jobs.some((job) => job.id === currentId)) {
    return currentId;
  }
  return jobs[0].id;
}
