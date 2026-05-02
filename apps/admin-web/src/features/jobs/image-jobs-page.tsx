"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { adminApi, type WorkerSummary } from "@/lib/admin-api";
import type { AdminImageJob } from "@/lib/admin-image-job-types";

import { ImageJobDetail } from "./image-job-detail";
import { ImageJobResults } from "./image-job-results";
import { ImageJobSidebar } from "./image-job-sidebar";

export function ImageJobsPage() {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial admin data load is request-driven state
    void loadData();
  }, [loadData]);

  return (
    <AdminShell
      title="图片任务"
      description="按任务索引、完整提示词和结果图拆分视图，便于快速审阅生成记录。"
      actions={<RefreshButton loading={loading} onRefresh={loadData} />}
    >
      {error ? <div className="col-span-12"><ErrorBox message={error} /></div> : null}
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
    </AdminShell>
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
