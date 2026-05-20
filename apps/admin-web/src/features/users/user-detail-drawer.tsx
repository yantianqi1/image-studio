"use client";

import { useState } from "react";

import { DetailDrawer } from "@/features/ui/detail-drawer";
import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import { StatusPill } from "@/features/ui/status-pill";
import { formatAuditActionLabel } from "@/features/ui/admin-labels";
import type { AdminAuditLog, AdminUser } from "@/lib/admin-api";
import { useAdminAuditLogs } from "@/lib/use-admin-data";
import { errorMessage, formatDateTime } from "./user-format";
import { UserStatusManagementPanel } from "./user-status-management-panel";

export function UserDetailDrawer({
  user,
  onUsersRefresh,
  onClose,
}: Readonly<{
  user: AdminUser | null;
  onUsersRefresh: () => void;
  onClose: () => void;
}>) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const displayedUser = currentUser?.id === user?.id ? currentUser : user;
  const { data: auditData, error: auditError, isLoading: auditLoading, mutate: mutateAuditLogs } = useAdminAuditLogs(
    displayedUser ? { target_type: "user", target_id: String(displayedUser.id), page_size: 5 } : null,
  );

  if (!displayedUser) {
    return null;
  }
  async function handleStatusChanged(nextUser: AdminUser) {
    setCurrentUser(nextUser);
    onUsersRefresh();
    await mutateAuditLogs();
  }

  return (
    <DetailDrawer
      open={Boolean(displayedUser)}
      title={displayedUser.display_name || displayedUser.email}
      description={displayedUser.email}
      onClose={onClose}
    >
      <UserDetailMeta user={displayedUser} />
      <UserStatusManagementPanel user={displayedUser} onStatusChanged={handleStatusChanged} />
      <UserAuditLogList loading={auditLoading} error={auditError} logs={auditData?.items ?? []} />
    </DetailDrawer>
  );
}

function UserDetailMeta({ user }: Readonly<{ user: AdminUser }>) {
  return (
    <div className="users-detail-meta">
      <span>#{user.id}</span>
      <StatusPill status={user.status} />
      <span>{formatDateTime(user.created_at)}</span>
    </div>
  );
}

function UserAuditLogList({
  loading,
  error,
  logs,
}: Readonly<{
  loading: boolean;
  error: unknown;
  logs: readonly AdminAuditLog[];
}>) {
  if (loading) {
    return <LoadingState title="正在读取最近管理操作" />;
  }
  if (error) {
    return <ErrorBox message={errorMessage(error, "读取审计日志失败")} />;
  }
  return (
    <section className="users-detail-panel">
      <div className="users-panel-heading">
        <div>
          <h3>最近管理操作</h3>
          <p>展示针对该用户的后台状态操作。</p>
        </div>
      </div>
      <div className="users-audit-list">
        {logs.length ? logs.map((log) => <UserAuditRow key={log.id} log={log} />) : <EmptyState title="暂无操作记录" description="当前用户还没有管理操作审计。" />}
      </div>
    </section>
  );
}

function UserAuditRow({ log }: Readonly<{ log: AdminAuditLog }>) {
  return (
    <div className="admin-list-row">
      <span className="min-w-0">
        <span className="users-primary-text">{formatAuditActionLabel(log.action)}</span>
        <span className="users-secondary-text">{log.reason}</span>
      </span>
      <span className="users-audit-meta">
        管理员 #{log.admin_user_id}
        <small>{formatDateTime(log.created_at)}</small>
      </span>
    </div>
  );
}
