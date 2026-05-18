"use client";

import { useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { AdminSection } from "@/features/ui/admin-page";
import { ErrorBox } from "@/features/ui/error-box";
import { StatusPill } from "@/features/ui/status-pill";
import type { AdminRedeemBatch, AdminRedeemBatchSummary } from "@/lib/admin-api";
import { useRedeemBatches } from "@/lib/use-admin-data";
import { useToast } from "@/lib/toast-context";
import { RedeemBatchDetailDrawer } from "./redeem-batch-detail-drawer";
import { RedeemBatchList } from "./redeem-batch-list";
import { RedeemCreateBatchPanel } from "./redeem-create-batch-panel";
import { copyCodeLines, downloadCodesCsv, errorText } from "./redeem-utils";

export function RedeemPage() {
  const { data: batches = [], error: batchesError, isLoading: batchesLoading, mutate: mutateBatches } = useRedeemBatches();
  const [latestBatch, setLatestBatch] = useState<AdminRedeemBatch | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<AdminRedeemBatchSummary | null>(null);
  const toast = useToast();

  async function handleCreated(batch: AdminRedeemBatch) {
    setLatestBatch(batch);
    await mutateBatches();
    toast.success(`批次 ${batch.name} 已创建`);
  }

  return (
    <AdminShell title="激活码与批次" description="后台可生成激活码批次，查看批次统计、兑换码和审计记录。">
      <div className="col-span-12 xl:col-span-5 grid gap-4 content-start">
        <RedeemCreateBatchPanel onCreated={handleCreated} />
        {latestBatch ? <LatestBatchPanel batch={latestBatch} onCopy={(codes) => copyLatestCodes(codes, toast)} /> : null}
        {batchesError ? <ErrorBox message={errorText(batchesError, "读取批次失败")} /> : null}
      </div>
      <div className="col-span-12 xl:col-span-7">
        <RedeemBatchList batches={batches} error={batchesError} loading={batchesLoading} onSelectBatch={setSelectedBatch} />
      </div>
      <RedeemBatchDetailDrawer
        batch={selectedBatch}
        onClose={() => setSelectedBatch(null)}
        onBatchChanged={mutateBatches}
      />
    </AdminShell>
  );
}

function LatestBatchPanel({
  batch,
  onCopy,
}: Readonly<{
  batch: AdminRedeemBatch;
  onCopy: (codes: readonly string[]) => Promise<void>;
}>) {
  return (
    <AdminSection title={`本次生成：${batch.name}`} description="创建成功后可立即复制全部兑换码。">
      <div className="flex justify-end gap-2">
        <button className="admin-button admin-button-secondary" type="button" onClick={() => void onCopy(batch.codes)}>
          一键复制全部
        </button>
        <button className="admin-button admin-button-secondary" type="button" onClick={() => downloadLatestBatch(batch)}>
          下载 CSV
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        {batch.codes.map((code) => (
          <div key={code} className="admin-card flex items-center justify-between gap-3">
            <span className="font-mono text-sm truncate">{code}</span>
            <StatusPill status="unused" />
          </div>
        ))}
      </div>
    </AdminSection>
  );
}

async function copyLatestCodes(codes: readonly string[], toast: ReturnType<typeof useToast>) {
  if (!codes.length) {
    toast.error("没有可复制的兑换码");
    return;
  }
  await copyCodeLines(codes);
  toast.success("已复制全部兑换码");
}

function downloadLatestBatch(batch: AdminRedeemBatch) {
  downloadCodesCsv(`${batch.name}-codes.csv`, batch.codes.map((code, index) => toBatchCodeRow(batch, code, index)));
}

function toBatchCodeRow(batch: AdminRedeemBatch, code: string, index: number) {
  return {
    id: index + 1,
    code,
    credit_amount_cents: batch.credit_amount_cents,
    credit_amount_credits: batch.credit_amount_credits,
    status: "unused",
    redeemed_by_user_id: null,
    redeemed_at: null,
    expires_at: batch.expires_at,
    created_at: batch.created_at,
  };
}
