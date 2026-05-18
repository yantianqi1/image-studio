"use client";

import { DataToolbar } from "@/features/ui/data-toolbar";
import { StatusPill } from "@/features/ui/status-pill";
import type { AdminRedeemBatchCode } from "@/lib/admin-api";
import { formatDateTime, formatNullableDate, getCodeEffectiveStatus } from "./redeem-utils";

const CODE_PAGE_SIZE = 100;
const STATUS_FILTERS = ["all", "unused", "redeemed", "disabled", "expired"] as const;

type CodeStatusFilter = (typeof STATUS_FILTERS)[number];

export function RedeemCodeTable({
  codes,
  statusFilter,
  page,
  onStatusFilterChange,
  onPageChange,
  onDisableCode,
}: Readonly<{
  codes: readonly AdminRedeemBatchCode[];
  statusFilter: CodeStatusFilter;
  page: number;
  onStatusFilterChange: (status: CodeStatusFilter) => void;
  onPageChange: (page: number) => void;
  onDisableCode: (code: AdminRedeemBatchCode) => void;
}>) {
  const filteredCodes = filterCodes(codes, statusFilter);
  const pageCount = Math.max(1, Math.ceil(filteredCodes.length / CODE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageCodes = filteredCodes.slice((currentPage - 1) * CODE_PAGE_SIZE, currentPage * CODE_PAGE_SIZE);

  return (
    <div className="grid gap-3">
      <DataToolbar title="批次兑换码" description={`共 ${filteredCodes.length} 条，单页 ${CODE_PAGE_SIZE} 条。`}>
        <select
          className="admin-input max-w-48"
          value={statusFilter}
          onChange={(event) => {
            onStatusFilterChange(event.target.value as CodeStatusFilter);
            onPageChange(1);
          }}
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </DataToolbar>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Redeemed By</th>
              <th>Redeemed At</th>
              <th>Expires</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pageCodes.map((code) => (
              <RedeemCodeRow key={code.id} code={code} onDisableCode={onDisableCode} />
            ))}
          </tbody>
        </table>
      </div>
      <CodePagination currentPage={currentPage} pageCount={pageCount} onPageChange={onPageChange} />
    </div>
  );
}

function RedeemCodeRow({
  code,
  onDisableCode,
}: Readonly<{
  code: AdminRedeemBatchCode;
  onDisableCode: (code: AdminRedeemBatchCode) => void;
}>) {
  const effectiveStatus = getCodeEffectiveStatus(code);
  return (
    <tr>
      <td className="font-mono">{code.code}</td>
      <td><StatusPill status={effectiveStatus} tone={effectiveStatus === "expired" ? "warning" : undefined} /></td>
      <td>{code.redeemed_by_user_id ? `#${code.redeemed_by_user_id}` : "-"}</td>
      <td>{code.redeemed_at ? formatDateTime(code.redeemed_at) : "-"}</td>
      <td>{formatNullableDate(code.expires_at)}</td>
      <td>{formatDateTime(code.created_at)}</td>
      <td>
        {code.status === "unused" ? (
          <button className="admin-button admin-button-secondary" type="button" onClick={() => onDisableCode(code)}>
            禁用
          </button>
        ) : (
          "-"
        )}
      </td>
    </tr>
  );
}

function CodePagination({
  currentPage,
  pageCount,
  onPageChange,
}: Readonly<{
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}>) {
  return (
    <div className="admin-pagination">
      <span>第 {currentPage} / {pageCount} 页</span>
      <div className="admin-pagination-actions">
        <button className="admin-button admin-button-secondary" type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          上一页
        </button>
        <button className="admin-button admin-button-secondary" type="button" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>
          下一页
        </button>
      </div>
    </div>
  );
}

export function filterCodes(codes: readonly AdminRedeemBatchCode[], status: CodeStatusFilter) {
  if (status === "all") {
    return codes;
  }
  return codes.filter((code) => getCodeEffectiveStatus(code) === status);
}

export type { CodeStatusFilter };
