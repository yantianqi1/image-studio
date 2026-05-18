import { apiFetch } from "@/lib/api-client";

export type AdminAuditLog = Readonly<{
  id: number;
  admin_user_id: number;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}>;

export type AdminAuditLogList = Readonly<{
  items: readonly AdminAuditLog[];
  total: number;
  page: number;
  page_size: number;
}>;

export type AdminAuditLogsQuery = Readonly<{
  action?: string;
  target_type?: string;
  target_id?: string;
  admin_user_id?: number;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
}>;

export const adminAuditApi = {
  auditLogs(query: AdminAuditLogsQuery = {}) {
    return apiFetch<AdminAuditLogList>(`/api/admin/audit-logs${buildQueryString(query)}`);
  },
};

function buildQueryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
