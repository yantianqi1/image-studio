"use client";

import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { AdminSection } from "@/features/ui/admin-page";
import { LoadingState } from "@/features/ui/loading-state";
import { StatusPill } from "@/features/ui/status-pill";
import type { AdminRedeemBatchSummary } from "@/lib/admin-api";
import { errorText, formatDateTime } from "./redeem-utils";

export function RedeemBatchList({
  batches,
  error,
  loading,
  onSelectBatch,
}: Readonly<{
  batches: readonly AdminRedeemBatchSummary[];
  error: unknown;
  loading: boolean;
  onSelectBatch: (batch: AdminRedeemBatchSummary) => void;
}>) {
  return (
    <AdminSection title="批次列表" description="点击任一批次打开详情、码表和审计记录。">
      {error ? <ErrorBox message={errorText(error, "读取批次失败")} /> : null}
      {loading ? <LoadingState title="正在读取兑换码批次" /> : null}
      {!loading && !batches.length ? <EmptyState title="暂无兑换码批次" description="当前还没有后台创建的兑换码批次。" /> : null}
      <div className="grid gap-2">
        {batches.map((batch) => (
          <button key={batch.id} type="button" className="admin-card text-left" onClick={() => onSelectBatch(batch)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{batch.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateTime(batch.created_at)} · {batch.note || "无备注"}
                </p>
              </div>
              <StatusPill status={batch.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 xl:grid-cols-5">
              <Meta label="单码额度" value={`${batch.credit_amount_credits} 额度`} />
              <Meta label="总数" value={String(batch.quantity)} />
              <Meta label="未兑换" value={String(batch.unused_quantity)} />
              <Meta label="已兑换" value={String(batch.redeemed_quantity)} />
              <Meta label="禁用/过期" value={`${batch.disabled_quantity} / ${batch.expired_quantity}`} />
            </div>
          </button>
        ))}
      </div>
    </AdminSection>
  );
}

function Meta({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-gray-700">{value}</p>
    </div>
  );
}
