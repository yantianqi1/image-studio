"use client";

import { useEffect, useState } from "react";

import { DetailDrawer } from "@/features/ui/detail-drawer";
import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import { StatusPill } from "@/features/ui/status-pill";
import { adminApi, type AdminAuditLog, type AdminUser, type AdminWallet, type AdminWalletLedgerEntry } from "@/lib/admin-api";
import { useAdminAuditLogs } from "@/lib/use-admin-data";
import { errorMessage, formatDateTime } from "./user-format";
import { UserLedgerList } from "./user-ledger-list";
import { UserWalletPanel } from "./user-wallet-panel";
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
  const [walletState, setWalletState] = useState<LoadState<AdminWallet | null>>({ loading: false, data: null, error: "" });
  const [ledgerState, setLedgerState] = useState<LoadState<readonly AdminWalletLedgerEntry[]>>({ loading: false, data: [], error: "" });

  useEffect(() => {
    if (user) {
      void reloadUserData(user.id, setWalletState, setLedgerState);
    }
  }, [user]);

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
      <UserWalletPanel
        loading={walletState.loading}
        wallet={walletState.data}
        error={walletState.error}
        userId={displayedUser.id}
        onAdjusted={() => reloadWalletLedgerAndAudit(displayedUser.id, setWalletState, setLedgerState, mutateAuditLogs)}
      />
      <UserLedgerList loading={ledgerState.loading} entries={ledgerState.data} error={ledgerState.error} />
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
          <p>展示针对该用户的后台状态和额度操作。</p>
        </div>
      </div>
      <div className="users-ledger-list">
        {logs.length ? logs.map((log) => <UserAuditRow key={log.id} log={log} />) : <EmptyState title="暂无操作记录" description="当前用户还没有管理操作审计。" />}
      </div>
    </section>
  );
}

function UserAuditRow({ log }: Readonly<{ log: AdminAuditLog }>) {
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

type LoadState<T> = Readonly<{
  loading: boolean;
  data: T;
  error: string;
}>;

function loadWallet(userId: number, setState: (state: LoadState<AdminWallet | null>) => void) {
  setState({ loading: true, data: null, error: "" });
  return adminApi.wallet(userId)
    .then((wallet) => setState({ loading: false, data: wallet, error: "" }))
    .catch((error) => setState({ loading: false, data: null, error: errorMessage(error, "读取钱包失败") }));
}

function loadLedger(userId: number, setState: (state: LoadState<readonly AdminWalletLedgerEntry[]>) => void) {
  setState({ loading: true, data: [], error: "" });
  return adminApi.walletLedger(userId)
    .then((entries) => setState({ loading: false, data: entries, error: "" }))
    .catch((error) => setState({ loading: false, data: [], error: errorMessage(error, "读取账本失败") }));
}

async function reloadUserData(
  userId: number,
  setWalletState: (state: LoadState<AdminWallet | null>) => void,
  setLedgerState: (state: LoadState<readonly AdminWalletLedgerEntry[]>) => void,
) {
  await Promise.all([loadWallet(userId, setWalletState), loadLedger(userId, setLedgerState)]);
}

function reloadWalletAndLedger(
  userId: number,
  setWalletState: (state: LoadState<AdminWallet | null>) => void,
  setLedgerState: (state: LoadState<readonly AdminWalletLedgerEntry[]>) => void,
) {
  return reloadUserData(userId, setWalletState, setLedgerState);
}

async function reloadWalletLedgerAndAudit(
  userId: number,
  setWalletState: (state: LoadState<AdminWallet | null>) => void,
  setLedgerState: (state: LoadState<readonly AdminWalletLedgerEntry[]>) => void,
  mutateAuditLogs: () => Promise<unknown>,
) {
  await reloadWalletAndLedger(userId, setWalletState, setLedgerState);
  await mutateAuditLogs();
}
