"use client";

import { useState } from "react";

import { adminApi, type AdminRedeemBatchCode, type AdminRedeemBatchSummary } from "@/lib/admin-api";
import { useAdminAuditLogs, useRedeemBatch, useRedeemBatchCodes } from "@/lib/use-admin-data";
import { useToast } from "@/lib/toast-context";
import { filterCodes, type CodeStatusFilter } from "./redeem-code-table";
import { RedeemBatchDrawerView, type PendingDisableAction } from "./redeem-batch-detail-view";
import { copyCodeLines, downloadCodesCsv, errorText } from "./redeem-utils";

export function RedeemBatchDetailDrawer({
  batch,
  onClose,
  onBatchChanged,
}: Readonly<{
  batch: AdminRedeemBatchSummary | null;
  onClose: () => void;
  onBatchChanged: () => Promise<unknown>;
}>) {
  const batchId = batch?.id ?? null;
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<CodeStatusFilter>("all");
  const [codePage, setCodePage] = useState(1);
  const [disableReason, setDisableReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingDisable, setPendingDisable] = useState<PendingDisableAction | null>(null);
  const detailState = useRedeemBatch(batchId);
  const codeState = useRedeemBatchCodes(batchId);
  const auditState = useAdminAuditLogs(batchId ? { target_type: "redeem_batch", target_id: String(batchId), page_size: 5 } : null);

  if (!batch) {
    return null;
  }

  const detail = detailState.data ?? batch;
  const codes = codeState.data ?? [];
  const filteredCodes = filterCodes(codes, statusFilter);
  const unusedCodes = filterCodes(codes, "unused");

  async function refreshDrawerData() {
    await Promise.all([detailState.mutate(), codeState.mutate(), auditState.mutate(), onBatchChanged()]);
  }

  return (
    <RedeemBatchDrawerView
      detail={detail}
      codes={codes}
      filteredCodes={filteredCodes}
      unusedCodes={unusedCodes}
      statusFilter={statusFilter}
      codePage={codePage}
      detailError={detailState.error}
      codeError={codeState.error}
      codesLoading={codeState.isLoading}
      auditLoading={auditState.isLoading}
      auditError={auditState.error}
      auditLogs={auditState.data?.items ?? []}
      pendingDisable={pendingDisable}
      disableReason={disableReason}
      actionError={actionError}
      onClose={onClose}
      onStatusFilterChange={setStatusFilter}
      onPageChange={setCodePage}
      onOpenBatchDisable={() => openDisableBatch(detail, setDisableReason, setActionError, setPendingDisable)}
      onOpenCodeDisable={(code) => openDisableCode(code, setDisableReason, setActionError, setPendingDisable)}
      onCopy={(codesToCopy, label) => copyCodes(codesToCopy, label, toast)}
      onDownload={(codesToDownload) => downloadBatchCodes(detail.name, codesToDownload, toast)}
      onCancelDisable={() => setPendingDisable(null)}
      onDisableReasonChange={setDisableReason}
      onConfirmDisable={async () => {
        try {
          const disabled = await confirmDisableAction(pendingDisable, disableReason, setActionError, refreshDrawerData);
          if (disabled) {
            toast.success(disableSuccessMessage(pendingDisable));
            setPendingDisable(null);
            setDisableReason("");
          }
        } catch (nextError) {
          setActionError(errorText(nextError, "禁用失败"));
        }
      }}
    />
  );
}

function openDisableBatch(
  batch: AdminRedeemBatchSummary,
  setReason: (reason: string) => void,
  setError: (error: string) => void,
  setPending: (action: PendingDisableAction) => void,
) {
  setReason("");
  setError("");
  setPending({ kind: "batch", batchId: batch.id, name: batch.name });
}

function openDisableCode(
  code: AdminRedeemBatchCode,
  setReason: (reason: string) => void,
  setError: (error: string) => void,
  setPending: (action: PendingDisableAction) => void,
) {
  setReason("");
  setError("");
  setPending({ kind: "code", code });
}

async function confirmDisableAction(
  action: PendingDisableAction | null,
  reason: string,
  setError: (error: string) => void,
  refresh: () => Promise<void>,
) {
  if (!action) {
    return false;
  }
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    setError("禁用原因不能为空");
    return false;
  }
  if (action.kind === "batch") {
    await adminApi.disableRedeemBatch(action.batchId, { reason: trimmedReason });
  } else {
    await adminApi.disableRedeemCode(action.code.id, { reason: trimmedReason });
  }
  await refresh();
  return true;
}

function disableSuccessMessage(action: PendingDisableAction | null) {
  return action?.kind === "batch" ? "批次已禁用" : "兑换码已禁用";
}

async function copyCodes(codes: readonly AdminRedeemBatchCode[], label: string, toast: ReturnType<typeof useToast>) {
  if (!codes.length) {
    toast.error("没有可复制的兑换码");
    return;
  }
  await copyCodeLines(codes.map((code) => code.code));
  toast.success(label);
}

function downloadBatchCodes(batchName: string, codes: readonly AdminRedeemBatchCode[], toast: ReturnType<typeof useToast>) {
  if (!codes.length) {
    toast.error("没有可导出的兑换码");
    return;
  }
  downloadCodesCsv(`${batchName}-codes.csv`, codes);
  toast.success("CSV 已生成");
}
