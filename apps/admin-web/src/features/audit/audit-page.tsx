"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { AdminSection } from "@/features/ui/admin-page";
import { EmptyState } from "@/features/ui/empty-state";
import { DataToolbar } from "@/features/ui/data-toolbar";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import type { AdminAuditLog } from "@/lib/admin-api";
import { useAdminAuditLogs } from "@/lib/use-admin-data";
import { adminErrorMessage } from "@/features/ui/admin-errors";
import { formatAuditActionLabel, formatAuditMetadata, formatAuditTargetLabel } from "@/features/ui/admin-labels";

const FIRST_PAGE = 1;
const AUDIT_PAGE_SIZE = 25;
const DATE_TIME_DISPLAY = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AuditDraft = Readonly<{
  action: string;
  targetType: string;
  targetId: string;
  adminUserId: string;
  createdFrom: string;
  createdTo: string;
}>;

const emptyDraft: AuditDraft = {
  action: "",
  targetType: "",
  targetId: "",
  adminUserId: "",
  createdFrom: "",
  createdTo: "",
};

export function AuditPage() {
  const [draft, setDraft] = useState<AuditDraft>(emptyDraft);
  const [filters, setFilters] = useState(toAuditQuery(emptyDraft, FIRST_PAGE));
  const { data, error, isLoading } = useAdminAuditLogs(filters);

  return (
    <AdminShell title="审计日志" description="集中查看后台敏感操作，包括用户状态、额度调整和兑换码生命周期。">
      <div className="col-span-12 grid gap-4">
        <AuditFilterBar
          draft={draft}
          setDraft={setDraft}
          onApply={() => setFilters(toAuditQuery(draft, FIRST_PAGE))}
          onReset={() => {
            setDraft(emptyDraft);
            setFilters(toAuditQuery(emptyDraft, FIRST_PAGE));
          }}
        />
        <AuditLogTable
          logs={data?.items ?? []}
          total={data?.total ?? 0}
          page={data?.page ?? FIRST_PAGE}
          pageSize={data?.page_size ?? AUDIT_PAGE_SIZE}
          loading={isLoading}
          error={error}
          onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
        />
      </div>
    </AdminShell>
  );
}

function AuditFilterBar({
  draft,
  setDraft,
  onApply,
  onReset,
}: Readonly<{
  draft: AuditDraft;
  setDraft: Dispatch<SetStateAction<AuditDraft>>;
  onApply: () => void;
  onReset: () => void;
}>) {
  return (
    <DataToolbar
      title="筛选"
      description="字段为空时不参与筛选。日期值按浏览器时间原样提交给接口。"
      actions={<AuditFilterActions onApply={onApply} onReset={onReset} />}
    >
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <input className="admin-input" placeholder="操作类型" value={draft.action} onChange={(event) => updateDraft(setDraft, { action: event.target.value })} />
        <input className="admin-input" placeholder="对象类型" value={draft.targetType} onChange={(event) => updateDraft(setDraft, { targetType: event.target.value })} />
        <input className="admin-input" placeholder="对象编号" value={draft.targetId} onChange={(event) => updateDraft(setDraft, { targetId: event.target.value })} />
        <input className="admin-input" placeholder="管理员编号" value={draft.adminUserId} onChange={(event) => updateDraft(setDraft, { adminUserId: event.target.value })} />
        <input className="admin-input" type="datetime-local" value={draft.createdFrom} onChange={(event) => updateDraft(setDraft, { createdFrom: event.target.value })} />
        <input className="admin-input" type="datetime-local" value={draft.createdTo} onChange={(event) => updateDraft(setDraft, { createdTo: event.target.value })} />
      </div>
    </DataToolbar>
  );
}

function AuditFilterActions({ onApply, onReset }: Readonly<{ onApply: () => void; onReset: () => void }>) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="admin-button" type="button" onClick={onApply}>应用筛选</button>
      <button className="admin-button admin-button-secondary" type="button" onClick={onReset}>重置</button>
    </div>
  );
}

function AuditLogTable({
  logs,
  total,
  page,
  pageSize,
  loading,
  error,
  onPageChange,
}: Readonly<{
  logs: readonly AdminAuditLog[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: unknown;
  onPageChange: (page: number) => void;
}>) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <AdminSection title="日志" description={`共 ${total} 条记录。`}>
      {error ? <ErrorBox message={errorMessage(error, "读取审计日志失败")} /> : null}
      {loading ? <LoadingState title="正在读取审计日志" /> : <AuditRows logs={logs} />}
      <div className="admin-pagination mt-3">
        <span>第 {page} / {pageCount} 页</span>
        <div className="admin-pagination-actions">
          <button className="admin-button admin-button-secondary" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
          <button className="admin-button admin-button-secondary" type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</button>
        </div>
      </div>
    </AdminSection>
  );
}

function AuditRows({ logs }: Readonly<{ logs: readonly AdminAuditLog[] }>) {
  if (!logs.length) {
    return <EmptyState title="暂无审计日志" description="当前筛选条件没有匹配记录。" />;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>操作</th>
            <th>对象</th>
            <th>原因</th>
            <th>管理员</th>
            <th>详情</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <AuditRow key={log.id} log={log} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditRow({ log }: Readonly<{ log: AdminAuditLog }>) {
  return (
    <tr>
      <td>{formatAuditActionLabel(log.action)}</td>
      <td>{formatAuditTargetLabel(log.target_type, log.target_id)}</td>
      <td>{log.reason}</td>
      <td>管理员 #{log.admin_user_id}</td>
      <td><code className="text-xs">{metadataText(log.metadata)}</code></td>
      <td>{formatDateTime(log.created_at)}</td>
    </tr>
  );
}

function updateDraft(setDraft: Dispatch<SetStateAction<AuditDraft>>, patch: Partial<AuditDraft>) {
  setDraft((current) => ({ ...current, ...patch }));
}

function toAuditQuery(draft: AuditDraft, page: number) {
  return {
    action: draft.action.trim() || undefined,
    target_type: draft.targetType.trim() || undefined,
    target_id: draft.targetId.trim() || undefined,
    admin_user_id: draft.adminUserId.trim() ? Number(draft.adminUserId.trim()) : undefined,
    created_from: draft.createdFrom || undefined,
    created_to: draft.createdTo || undefined,
    page,
    page_size: AUDIT_PAGE_SIZE,
  };
}

function metadataText(metadata: Record<string, unknown>) {
  return formatAuditMetadata(metadata);
}

function formatDateTime(value: string) {
  return DATE_TIME_DISPLAY.format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  return adminErrorMessage(error, fallback);
}
