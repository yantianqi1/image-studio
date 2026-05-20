"use client";

import { ADMIN_NAV_GROUPS, type AdminNavItem } from "@/features/shell/admin-navigation";
import { AdminShell } from "@/features/shell/admin-shell";
import { AdminSection } from "@/features/ui/admin-page";
import { DataToolbar } from "@/features/ui/data-toolbar";
import { StatCard } from "@/features/ui/stat-card";
import { useAdminComicTasks, useAdminJobs, useAdminStats, useAdminUsers, useWorkerSummary } from "@/lib/use-admin-data";
import {
  comicTaskFailureHint,
  comicTaskFailureValue,
  firstError,
  metricHint,
  metricValue,
  successRateValue,
  workerAlertHint,
  workerAlertValue,
} from "./admin-overview-helpers";
import { FailedComicTaskList, FailedImageJobList, PendingWorkList, QuickActionCard } from "./admin-overview-lists";

const QUICK_ACTION_HREFS = new Set(["/admin/users", "/admin/providers", "/admin/image-jobs", "/admin/comic-jobs", "/admin/audit"]);
const PREVIEW_LIMIT = 5;
const allNavItems = ADMIN_NAV_GROUPS.reduce<readonly AdminNavItem[]>(
  (items, group) => [...items, ...(group.items as readonly AdminNavItem[])],
  [],
);
const quickActions = allNavItems.filter((item) => QUICK_ACTION_HREFS.has(item.href));

export function AdminOverviewPage() {
  const users = useAdminUsers({ page: 1, pageSize: 1 });
  const stats = useAdminStats();
  const worker = useWorkerSummary();
  const failedJobs = useAdminJobs({ status: "failed", page: 1, page_size: PREVIEW_LIMIT });
  const comicTasks = useAdminComicTasks();

  return (
    <AdminShell title="后台概览" description="实时查看用户、任务、模型接入和 worker 的关键状态，并快速跳转到常用操作。">
      <AdminSection title="实时指标" description="来自当前后台接口的摘要状态。">
        <DashboardMetrics
          users={users}
          stats={stats}
          worker={worker}
          failedJobs={failedJobs}
          comicTasks={comicTasks}
        />
      </AdminSection>

      <AdminSection title="常用操作" description="同一份导航配置派生的快捷入口。">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((item) => (
            <QuickActionCard key={item.href} item={item} />
          ))}
        </div>
      </AdminSection>

      <AdminSection title="待处理事项" description="需要优先确认的异常和提醒。">
        <PendingWorkList
          loading={worker.isLoading || failedJobs.isLoading || comicTasks.isLoading}
          error={firstError([worker.error, failedJobs.error, comicTasks.error])}
          failedImageCount={failedJobs.data?.total ?? 0}
          comicTasks={comicTasks.data ?? []}
          alerts={worker.data?.alerts ?? []}
        />
      </AdminSection>

      <AdminSection title="最近失败图片任务" description="帮助快速定位生成链路、模型和上游错误。">
        <FailedImageJobList loading={failedJobs.isLoading} error={failedJobs.error} jobs={failedJobs.data?.items ?? []} />
      </AdminSection>

      <AdminSection title="最近失败漫画任务" description="漫画任务目前只读，失败项用于排查流程。">
        <FailedComicTaskList loading={comicTasks.isLoading} error={comicTasks.error} tasks={comicTasks.data ?? []} />
      </AdminSection>
    </AdminShell>
  );
}

function DashboardMetrics({
  users,
  stats,
  worker,
  failedJobs,
  comicTasks,
}: Readonly<{
  users: ReturnType<typeof useAdminUsers>;
  stats: ReturnType<typeof useAdminStats>;
  worker: ReturnType<typeof useWorkerSummary>;
  failedJobs: ReturnType<typeof useAdminJobs>;
  comicTasks: ReturnType<typeof useAdminComicTasks>;
}>) {
  return (
    <DataToolbar title="核心状态" description="用户、失败任务、worker 告警和生成成功率。" actions={<span className="text-xs font-semibold text-gray-400">只读摘要</span>}>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="用户总数" value={metricValue(users.isLoading, users.error, users.data?.total)} hint={metricHint(users.isLoading, users.error, "来自后台用户接口")} />
        <StatCard label="失败图片任务" value={metricValue(failedJobs.isLoading, failedJobs.error, failedJobs.data?.total)} hint={metricHint(failedJobs.isLoading, failedJobs.error, "来自后台图片任务接口")} />
        <StatCard label="任务进程告警" value={workerAlertValue(worker.isLoading, worker.error, worker.data?.alerts.length)} hint={workerAlertHint(worker.isLoading, worker.error, worker.data?.image_jobs.stale_after_seconds)} />
        <StatCard label="成功率" value={successRateValue(stats.isLoading, stats.error, stats.data?.overview.success_rate)} hint={metricHint(stats.isLoading, stats.error, "来自后台图片统计接口")} />
        <StatCard label="漫画失败任务" value={comicTaskFailureValue(comicTasks.isLoading, comicTasks.error, comicTasks.data)} hint={comicTaskFailureHint(comicTasks.isLoading, comicTasks.error)} />
      </div>
    </DataToolbar>
  );
}
