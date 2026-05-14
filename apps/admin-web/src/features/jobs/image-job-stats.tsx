"use client";

import { useAdminStats } from "@/lib/use-admin-data";
import type { DailyTrendItem, DistributionItem, ImageJobStats } from "@/lib/admin-image-job-types";

export function ImageJobStatsPanel() {
  const { data: stats, error, isLoading } = useAdminStats();

  if (isLoading) return <div className="admin-panel p-6 text-center text-sm text-gray-500">加载统计数据...</div>;
  if (error) return <div className="admin-panel p-6 text-center text-sm text-red-600">{error instanceof Error ? error.message : "加载统计失败"}</div>;
  if (!stats) return null;

  return (
    <div className="grid gap-4">
      <MetricCards stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DailyTrendChart data={stats.daily_trend} />
        <RevenueChart data={stats.daily_trend} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionPanel title="模型使用分布" items={stats.distribution.model} />
        <DistributionPanel title="来源分布" items={stats.distribution.source} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionPanel title="分辨率分布" items={stats.distribution.size} />
        <DistributionPanel title="画质分布" items={stats.distribution.quality} />
      </div>
    </div>
  );
}

function MetricCards({ stats }: { stats: ImageJobStats }) {
  const avgDuration = stats.performance.avg_duration_seconds;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="总任务数" value={String(stats.overview.total)} />
      <MetricCard label="成功率" value={`${(stats.overview.success_rate * 100).toFixed(1)}%`} tone="success" />
      <MetricCard label="总收入" value={`¥${(stats.revenue.total_cents / 100).toFixed(2)}`} />
      <MetricCard label="平均耗时" value={avgDuration != null ? `${avgDuration.toFixed(1)}s` : "—"} />
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="admin-card flex flex-col items-center justify-center gap-1 py-4">
      <span className={`text-xl font-bold ${tone === "success" ? "text-emerald-600" : ""}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function DailyTrendChart({ data }: { data: readonly DailyTrendItem[] }) {
  if (data.length === 0) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <section className="admin-panel p-4">
      <h3 className="mb-3 text-sm font-semibold">每日任务量（近14天）</h3>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {data.map((d) => (
          <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
            <div
              className="w-full rounded-t bg-blue-400 transition-colors group-hover:bg-blue-600"
              style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
            />
            <span className="mt-1 text-[9px] text-gray-400">{d.date.slice(5)}</span>
            <div className="pointer-events-none absolute -top-6 hidden rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {d.count}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RevenueChart({ data }: { data: readonly DailyTrendItem[] }) {
  if (data.length === 0) return null;
  const maxRevenue = Math.max(...data.map((d) => d.revenue_cents), 1);
  return (
    <section className="admin-panel p-4">
      <h3 className="mb-3 text-sm font-semibold">每日收入（近14天）</h3>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {data.map((d) => (
          <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
            <div
              className="w-full rounded-t bg-emerald-400 transition-colors group-hover:bg-emerald-600"
              style={{ height: `${(d.revenue_cents / maxRevenue) * 100}%`, minHeight: d.revenue_cents > 0 ? 4 : 0 }}
            />
            <span className="mt-1 text-[9px] text-gray-400">{d.date.slice(5)}</span>
            <div className="pointer-events-none absolute -top-6 hidden rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              ¥{(d.revenue_cents / 100).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DistributionPanel({ title, items }: { title: string; items: readonly DistributionItem[] }) {
  if (items.length === 0) return <section className="admin-panel p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-xs text-gray-400">暂无数据</p></section>;
  const maxCount = items[0].count;
  return (
    <section className="admin-panel p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid gap-2">
        {items.slice(0, 10).map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-gray-600" title={item.key}>{item.key}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-gray-100">
              <div className="h-full rounded bg-blue-300" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-gray-500">{item.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
