"use client";

import { useState } from "react";

import "@/features/jobs/image-jobs.css";
import "@/features/jobs/image-worker-runtime.css";
import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { adminApi, type AdminDeadLetterItem } from "@/lib/admin-api";
import { useToast } from "@/lib/toast-context";
import {
  useAdminJobs,
  useDeadLetterItems,
  useImageQueueSummary,
  useRunningImageItems,
  useWorkerNodes,
  useWorkerSummary,
} from "@/lib/use-admin-data";

import { ImageJobLogList } from "./image-job-log-list";
import { ImageJobStatsPanel } from "./image-job-stats";
import { ImageWorkerRuntimePanel } from "./image-worker-runtime-panel";

type Tab = "logs" | "dead-letter" | "stats";
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
  const toast = useToast();

  const { data: jobsData, error: jobsError, isLoading: jobsLoading, mutate: mutateJobs } = useAdminJobs({
    page,
    page_size: 50,
    status: statusFilter || undefined,
  });
  const { data: summary, error: summaryError } = useWorkerSummary();
  const { data: workers, error: workersError, mutate: mutateWorkers } = useWorkerNodes();
  const { data: queueSummary, error: queueSummaryError, mutate: mutateQueueSummary } = useImageQueueSummary();
  const { data: runningItems, error: runningItemsError, mutate: mutateRunningItems } = useRunningImageItems();
  const { data: deadLetters, error: deadLetterError, mutate: mutateDeadLetters } = useDeadLetterItems();

  const jobs = jobsData?.items ?? [];
  const totalJobs = jobsData?.total ?? 0;
  const totalPages = Math.ceil(totalJobs / 50);

  const error = buildErrorMessage(jobsError, deadLetterError);
  async function refreshQueues(message: string) {
    await Promise.all([mutateJobs(), mutateDeadLetters(), mutateWorkers(), mutateQueueSummary(), mutateRunningItems()]);
    toast.success(message);
  }

  async function updateWorker(workerId: string, action: "drain" | "resume") {
    try {
      if (action === "drain") await adminApi.drainWorker(workerId);
      else await adminApi.resumeWorker(workerId);
      await mutateWorkers();
      toast.success(action === "drain" ? `Worker ${workerId} 已进入 drain` : `Worker ${workerId} 已恢复`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新 worker 状态失败");
    }
  }

  return (
    <AdminShell
      title="图片任务"
      description="按提示词、参数、上游成本和结果图逐条审阅生成记录。"
      actions={<RefreshButton loading={jobsLoading} onRefresh={() => mutateJobs()} />}
    >
      <div className="col-span-12 grid gap-4">
        <ImageWorkerRuntimePanel
          queueSummary={queueSummary ?? null}
          queueSummaryError={queueSummaryError}
          runningItems={runningItems?.items ?? []}
          runningItemsError={runningItemsError}
          summary={summary ?? null}
          summaryError={summaryError}
          workers={workers?.items ?? []}
          workersError={workersError}
          onDrain={(workerId) => updateWorker(workerId, "drain")}
          onResume={(workerId) => updateWorker(workerId, "resume")}
        />
        <TabBar active={activeTab} onChange={setActiveTab} />
        {error ? <ErrorBox message={error} /> : null}

        {activeTab === "logs" && (
          <>
            <StatusFilterBar active={statusFilter} onChange={(s) => { setStatusFilter(s); setPage(1); }} />
            <ImageJobLogList
              jobs={jobs}
              loading={jobsLoading}
              onChanged={refreshQueues}
              onError={toast.error}
              summary={summary ?? null}
            />
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button className="admin-button" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
                <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                <button className="admin-button" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
              </div>
            )}
          </>
        )}

        {activeTab === "dead-letter" && (
          <DeadLetterPanel
            items={deadLetters?.items ?? []}
            onChanged={refreshQueues}
            onError={toast.error}
          />
        )}

        {activeTab === "stats" && <ImageJobStatsPanel />}
      </div>
    </AdminShell>
  );
}

function buildErrorMessage(...errors: readonly unknown[]): string {
  const error = errors.find(Boolean);
  if (!error) return "";
  return error instanceof Error ? error.message : "读取图片任务失败";
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
    { key: "dead-letter", label: "死信队列" },
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

function DeadLetterPanel({
  items,
  onChanged,
  onError,
}: Readonly<{
  items: readonly AdminDeadLetterItem[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  return (
    <section className="admin-panel image-dead-letter-panel">
      <div className="image-job-log-header">
        <div>
          <h2>死信队列</h2>
          <p>{items.length} 条失败执行单元</p>
        </div>
      </div>
      <div className="image-dead-letter-list">
        {items.map((item) => (
          <DeadLetterRow item={item} key={item.item_id} onChanged={onChanged} onError={onError} />
        ))}
        {items.length === 0 ? <p className="image-job-empty">暂无死信任务。</p> : null}
      </div>
    </section>
  );
}

function DeadLetterRow({
  item,
  onChanged,
  onError,
}: Readonly<{
  item: AdminDeadLetterItem;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  return (
    <article className="image-dead-letter-row">
      <div>
        <strong>任务 #{item.job_id} / 图 #{item.result_index}</strong>
        <p>{item.prompt}</p>
        <span>{item.last_error_message ?? item.last_error_code ?? "未记录错误"}</span>
      </div>
      <div className="image-job-row-actions">
        <button className="admin-button" type="button" onClick={() => retryDeadLetterItem(item, onChanged, onError)}>
          重试单图
        </button>
        <button className="admin-button" type="button" onClick={() => cancelDeadLetterItem(item, onChanged, onError)}>
          取消单图
        </button>
      </div>
    </article>
  );
}

async function retryDeadLetterItem(
  item: AdminDeadLetterItem,
  onChanged: (message: string) => Promise<void>,
  onError: (message: string) => void,
) {
  try {
    await adminApi.retryImageItem(item.item_id);
    await onChanged(`单图 #${item.item_id} 已重试`);
  } catch (error) {
    onError(error instanceof Error ? error.message : "重试单图失败");
  }
}

async function cancelDeadLetterItem(
  item: AdminDeadLetterItem,
  onChanged: (message: string) => Promise<void>,
  onError: (message: string) => void,
) {
  try {
    await adminApi.cancelImageItem(item.item_id);
    await onChanged(`单图 #${item.item_id} 已取消`);
  } catch (error) {
    onError(error instanceof Error ? error.message : "取消单图失败");
  }
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
