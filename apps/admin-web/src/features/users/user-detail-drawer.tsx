"use client";

import { useEffect, useState } from "react";

import { StatusPill } from "@/features/ui/status-pill";
import { adminApi, type AdminUser, type AdminWallet, type AdminWalletLedgerEntry } from "@/lib/admin-api";
import { errorMessage, formatDateTime } from "./user-format";
import { UserLedgerList } from "./user-ledger-list";
import { UserWalletPanel } from "./user-wallet-panel";

export function UserDetailDrawer({
  user,
  onClose,
}: Readonly<{
  user: AdminUser | null;
  onClose: () => void;
}>) {
  const [walletState, setWalletState] = useState<LoadState<AdminWallet | null>>({ loading: false, data: null, error: "" });
  const [ledgerState, setLedgerState] = useState<LoadState<readonly AdminWalletLedgerEntry[]>>({ loading: false, data: [], error: "" });

  useEffect(() => {
    if (!user) {
      return;
    }
    loadWallet(user.id, setWalletState);
    loadLedger(user.id, setLedgerState);
  }, [user]);

  if (!user) {
    return null;
  }
  return (
    <aside className="users-drawer" aria-label="用户详情">
      <div className="users-drawer-header">
        <div className="min-w-0">
          <h2>{user.display_name || user.email}</h2>
          <p>{user.email}</p>
        </div>
        <button className="admin-button users-secondary-button" type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="users-detail-meta">
        <span>#{user.id}</span>
        <StatusPill status={user.status} />
        <span>{formatDateTime(user.created_at)}</span>
      </div>
      <UserWalletPanel loading={walletState.loading} wallet={walletState.data} error={walletState.error} />
      <UserLedgerList loading={ledgerState.loading} entries={ledgerState.data} error={ledgerState.error} />
    </aside>
  );
}

type LoadState<T> = Readonly<{
  loading: boolean;
  data: T;
  error: string;
}>;

function loadWallet(userId: number, setState: (state: LoadState<AdminWallet | null>) => void) {
  setState({ loading: true, data: null, error: "" });
  adminApi.wallet(userId)
    .then((wallet) => setState({ loading: false, data: wallet, error: "" }))
    .catch((error) => setState({ loading: false, data: null, error: errorMessage(error, "读取钱包失败") }));
}

function loadLedger(userId: number, setState: (state: LoadState<readonly AdminWalletLedgerEntry[]>) => void) {
  setState({ loading: true, data: [], error: "" });
  adminApi.walletLedger(userId)
    .then((entries) => setState({ loading: false, data: entries, error: "" }))
    .catch((error) => setState({ loading: false, data: [], error: errorMessage(error, "读取账本失败") }));
}
