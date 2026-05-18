"use client";

import { ConfirmDialog } from "@/features/ui/confirm-dialog";
import { DetailDrawer } from "@/features/ui/detail-drawer";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import { StatCard } from "@/features/ui/stat-card";
import type { AdminAuditLog, AdminRedeemBatchCode, AdminRedeemBatchSummary } from "@/lib/admin-api";
import { RedeemCodeTable, type CodeStatusFilter } from "./redeem-code-table";
import { errorText, formatDateTime, formatNullableDate } from "./redeem-utils";

export type PendingDisableAction =
  | Readonly<{ kind: "batch"; batchId: number; name: string }>
  | Readonly<{ kind: "code"; code: AdminRedeemBatchCode }>;

export function RedeemBatchDrawerView({
  detail,
  codes,
  filteredCodes,
  unusedCodes,
  statusFilter,
  codePage,
  detailError,
  codeError,
  codesLoading,
  auditLoading,
  auditError,
  auditLogs,
  pendingDisable,
  disableReason,
  actionError,
  onClose,
  onStatusFilterChange,
  onPageChange,
  onOpenBatchDisable,
  onOpenCodeDisable,
  onCopy,
  onDownload,
  onCancelDisable,
  onDisableReasonChange,
  onConfirmDisable,
}: Readonly<{
  detail: AdminRedeemBatchSummary;
  codes: readonly AdminRedeemBatchCode[];
  filteredCodes: readonly AdminRedeemBatchCode[];
  unusedCodes: readonly AdminRedeemBatchCode[];
  statusFilter: CodeStatusFilter;
  codePage: number;
  detailError: unknown;
  codeError: unknown;
  codesLoading: boolean;
  auditLoading: boolean;
  auditError: unknown;
  auditLogs: readonly AdminAuditLog[];
  pendingDisable: PendingDisableAction | null;
  disableReason: string;
  actionError: string;
  onClose: () => void;
  onStatusFilterChange: (status: CodeStatusFilter) => void;
  onPageChange: (page: number) => void;
  onOpenBatchDisable: () => void;
  onOpenCodeDisable: (code: AdminRedeemBatchCode) => void;
  onCopy: (codes: readonly AdminRedeemBatchCode[], label: string) => Promise<void>;
  onDownload: (codes: readonly AdminRedeemBatchCode[]) => void;
  onCancelDisable: () => void;
  onDisableReasonChange: (reason: string) => void;
  onConfirmDisable: () => Promise<void>;
}>) {
  return (
    <DetailDrawer
      open
      title={detail.name}
      description={`批次 #${detail.id} · 创建于 ${formatDateTime(detail.created_at)}`}
      onClose={onClose}
      actions={<BatchDisableButton batch={detail} onDisable={onOpenBatchDisable} />}
    >
      <BatchStats batch={detail} />
      {detailError ? <ErrorBox message={errorText(detailError, "读取批次详情失败")} /> : null}
      {codeError ? <ErrorBox message={errorText(codeError, "读取批次兑换码失败")} /> : null}
      {codesLoading ? <LoadingState title="正在读取兑换码" /> : null}
      <BatchCodeActions filteredCodes={filteredCodes} unusedCodes={unusedCodes} onCopy={onCopy} onDownload={onDownload} />
      <RedeemCodeTable
        codes={codes}
        statusFilter={statusFilter}
        page={codePage}
        onStatusFilterChange={onStatusFilterChange}
        onPageChange={onPageChange}
        onDisableCode={onOpenCodeDisable}
      />
      <BatchAuditList loading={auditLoading} error={auditError} logs={auditLogs} />
      <ConfirmDialog
        open={Boolean(pendingDisable)}
        title={disableDialogTitle(pendingDisable)}
        description={disableDialogDescription(pendingDisable)}
        confirmLabel="确认禁用"
        danger
        onCancel={onCancelDisable}
        onConfirm={onConfirmDisable}
      >
        <textarea
          className="admin-input min-h-20 resize-y"
          placeholder="禁用原因，必填"
          value={disableReason}
          onChange={(event) => onDisableReasonChange(event.target.value)}
        />
        {actionError ? <p className="users-inline-error">{actionError}</p> : null}
      </ConfirmDialog>
    </DetailDrawer>
  );
}

function BatchStats({ batch }: Readonly<{ batch: AdminRedeemBatchSummary }>) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
      <StatCard label="总数" value={String(batch.quantity)} />
      <StatCard label="未兑换" value={String(batch.unused_quantity)} />
      <StatCard label="已兑换" value={String(batch.redeemed_quantity)} />
      <StatCard label="已禁用" value={String(batch.disabled_quantity)} />
      <StatCard label="过期" value={String(batch.expired_quantity)} hint={formatNullableDate(batch.expires_at)} />
    </div>
  );
}

function BatchDisableButton({ batch, onDisable }: Readonly<{ batch: AdminRedeemBatchSummary; onDisable: () => void }>) {
  return (
    <button className="admin-button admin-button-danger" type="button" disabled={batch.status === "disabled"} onClick={onDisable}>
      禁用批次
    </button>
  );
}

function BatchCodeActions({
  filteredCodes,
  unusedCodes,
  onCopy,
  onDownload,
}: Readonly<{
  filteredCodes: readonly AdminRedeemBatchCode[];
  unusedCodes: readonly AdminRedeemBatchCode[];
  onCopy: (codes: readonly AdminRedeemBatchCode[], label: string) => Promise<void>;
  onDownload: (codes: readonly AdminRedeemBatchCode[]) => void;
}>) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="admin-button admin-button-secondary" type="button" onClick={() => void onCopy(unusedCodes, "已复制未兑换兑换码")}>
        复制未兑换
      </button>
      <button className="admin-button admin-button-secondary" type="button" onClick={() => void onCopy(filteredCodes, "已复制当前筛选兑换码")}>
        复制当前筛选
      </button>
      <button className="admin-button admin-button-secondary" type="button" onClick={() => onDownload(filteredCodes)}>
        下载 CSV
      </button>
    </div>
  );
}

function BatchAuditList({
  loading,
  error,
  logs,
}: Readonly<{
  loading: boolean;
  error: unknown;
  logs: readonly AdminAuditLog[];
}>) {
  if (loading) {
    return <LoadingState title="正在读取批次审计记录" />;
  }
  if (error) {
    return <ErrorBox message={errorText(error, "读取审计日志失败")} />;
  }
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <h2 className="admin-section-title">最近审计</h2>
          <p className="admin-section-description">针对该批次的创建与禁用操作。</p>
        </div>
      </div>
      <div className="admin-section-body">
        {logs.length ? logs.map((log) => <AuditLogRow key={log.id} log={log} />) : <div className="admin-loading-state">暂无审计记录</div>}
      </div>
    </section>
  );
}

function AuditLogRow({ log }: Readonly<{ log: AdminAuditLog }>) {
  return (
    <div className="admin-list-row">
      <span className="min-w-0">
        <span className="users-primary-text">{log.action}</span>
        <span className="users-secondary-text">{log.reason}</span>
      </span>
      <span className="users-ledger-amount">
        #{log.admin_user_id}
        <small>{formatDateTime(log.created_at)}</small>
      </span>
    </div>
  );
}

function disableDialogTitle(action: PendingDisableAction | null) {
  return action?.kind === "code" ? "禁用单个兑换码" : "禁用整批兑换码";
}

function disableDialogDescription(action: PendingDisableAction | null) {
  if (!action) {
    return "";
  }
  return action.kind === "code" ? `确认禁用 ${action.code.code}？` : `确认禁用批次 ${action.name} 及未兑换码？`;
}
