"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { AdminSection } from "@/features/ui/admin-page";
import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import { StatCard } from "@/features/ui/stat-card";
import { UserCreditAdjustmentForm } from "@/features/users/user-credit-adjustment-form";
import { adminApi, type AdminUser } from "@/lib/admin-api";
import { useToast } from "@/lib/toast-context";
import { errorMessage, formatCredits, formatDateTime } from "@/features/users/user-format";

type WalletState = Awaited<ReturnType<typeof adminApi.wallet>>;
type LedgerItem = Awaited<ReturnType<typeof adminApi.walletLedger>>[number];

type SelectedUser = Readonly<{
  id: number;
  label: string;
}>;

type LoadState<T> = Readonly<{
  loading: boolean;
  data: T;
  error: string;
}>;

const emptyWalletState: LoadState<WalletState | null> = { loading: false, data: null, error: "" };
const emptyLedgerState: LoadState<readonly LedgerItem[]> = { loading: false, data: [], error: "" };

export function BillingPage() {
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [walletState, setWalletState] = useState(emptyWalletState);
  const [ledgerState, setLedgerState] = useState(emptyLedgerState);
  const toast = useToast();

  async function selectUser(user: SelectedUser) {
    setSelectedUser(user);
    try {
      await refreshWalletAndLedger(user.id, setWalletState, setLedgerState);
      toast.info(`已读取 ${user.label} 的钱包与账本`);
    } catch (nextError) {
      toast.error(errorMessage(nextError, "查询用户钱包失败"));
    }
  }

  async function refreshSelectedUser() {
    if (!selectedUser) {
      return;
    }
    await refreshWalletAndLedger(selectedUser.id, setWalletState, setLedgerState);
  }

  return (
    <AdminShell title="钱包与账本" description="按用户查看余额、ledger，并执行管理员手工调账。">
      <div className="col-span-12 grid gap-4 xl:col-span-4">
        <AdminSection title="按用户查询" description="搜索邮箱、名称，或直接输入用户 ID。">
          <UserSearchInput onSelect={(user) => void selectUser(user)} />
          {selectedUser ? (
            <div className="admin-card mt-3">
              <p className="text-xs font-semibold text-gray-400">当前用户</p>
              <p className="mt-1 text-sm font-semibold text-gray-950">{selectedUser.label}</p>
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState title="未选择用户" description="先搜索或手动输入用户 ID 后再查看钱包。" />
            </div>
          )}
        </AdminSection>

        <AdminSection title="管理员调账" description="前端输入额度 credits，提交时按项目单位转换为后端 cents。">
          <WalletAdjustmentPanel selectedUser={selectedUser} walletState={walletState} onAdjusted={refreshSelectedUser} />
        </AdminSection>
      </div>

      <div className="col-span-12 grid gap-4 xl:col-span-8">
        <AdminSection title="余额概览" description="余额、锁定额度和币种来自钱包接口。">
          <WalletSnapshot state={walletState} />
        </AdminSection>
        <AdminSection title="账本流水" description="排查注册赠送、任务扣费、管理员调账等余额变化。">
          <LedgerList state={ledgerState} />
        </AdminSection>
      </div>
    </AdminShell>
  );
}

function WalletAdjustmentPanel({
  selectedUser,
  walletState,
  onAdjusted,
}: Readonly<{
  selectedUser: SelectedUser | null;
  walletState: LoadState<WalletState | null>;
  onAdjusted: () => Promise<void>;
}>) {
  if (!selectedUser) {
    return <EmptyState title="未选择用户" description="选择用户后才可以进行调账。" />;
  }
  if (walletState.loading) {
    return <LoadingState title="正在读取钱包" />;
  }
  if (walletState.error) {
    return <ErrorBox message={walletState.error} />;
  }
  if (!walletState.data) {
    return <EmptyState title="暂无钱包数据" description="该用户的钱包接口没有返回数据。" />;
  }
  return <UserCreditAdjustmentForm userId={selectedUser.id} wallet={walletState.data} onAdjusted={onAdjusted} />;
}

function WalletSnapshot({ state }: Readonly<{ state: LoadState<WalletState | null> }>) {
  if (state.loading) {
    return <LoadingState title="正在读取余额" />;
  }
  if (state.error) {
    return <ErrorBox message={state.error} />;
  }
  if (!state.data) {
    return <EmptyState title="未读取钱包" description="选择用户后会显示余额、锁定额度和币种。" />;
  }
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      <StatCard label="余额" value={formatCredits(state.data.balance_credits)} />
      <StatCard label="锁定" value={formatCredits(state.data.locked_credits)} />
      <StatCard label="币种" value={state.data.currency} />
    </div>
  );
}

function LedgerList({ state }: Readonly<{ state: LoadState<readonly LedgerItem[]> }>) {
  if (state.loading) {
    return <LoadingState title="正在读取账本" />;
  }
  if (state.error) {
    return <ErrorBox message={state.error} />;
  }
  if (state.data.length === 0) {
    return <EmptyState title="暂无账本记录" description="未选择用户，或该用户还没有 ledger 记录。" />;
  }
  return <div className="grid gap-2">{state.data.map((item) => <LedgerRow key={item.id} item={item} />)}</div>;
}

function LedgerRow({ item }: Readonly<{ item: LedgerItem }>) {
  return (
    <div className="admin-card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {item.reason} · <span className={item.amount_credits >= 0 ? "text-emerald-600" : "text-red-600"}>{item.amount_credits >= 0 ? "+" : ""}{formatCredits(item.amount_credits)}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{item.reference_type}:{item.reference_id}</p>
      </div>
      <p className="shrink-0 text-xs text-gray-400">{formatDateTime(item.created_at)}</p>
    </div>
  );
}

function UserSearchInput({ onSelect }: Readonly<{ onSelect: (user: SelectedUser) => void }>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly AdminUser[]>([]);
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [searchError, setSearchError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    const trimmedQuery = q.trim();
    if (!trimmedQuery) {
      setResults([]);
      setOpen(false);
      setSearchError("");
      return;
    }
    adminApi.users({ q: trimmedQuery, pageSize: 5 })
      .then((res) => {
        setResults(res.items);
        setOpen(res.items.length > 0);
        setSearchError("");
      })
      .catch((nextError) => {
        setResults([]);
        setOpen(false);
        setSearchError(errorMessage(nextError, "搜索用户失败"));
      });
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(user: AdminUser) {
    setQuery(`${user.email} (#${user.id})`);
    setOpen(false);
    onSelect({ id: user.id, label: user.display_name || user.email });
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = Number(form.get("manual_user_id") ?? "0");
    if (userId <= 0) {
      setSearchError("用户 ID 必须大于 0");
      return;
    }
    setSearchError("");
    onSelect({ id: userId, label: `用户 #${userId}` });
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <input
          className="admin-input"
          placeholder="搜索用户邮箱或名称..."
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open ? <SearchResults users={results} onSelect={handleSelect} /> : null}
      </div>
      {searchError ? <ErrorBox message={searchError} /> : null}
      <button type="button" className="text-left text-xs text-blue-600 hover:underline" onClick={() => setManualMode(!manualMode)}>
        {manualMode ? "收起手动输入" : "手动输入用户 ID"}
      </button>
      {manualMode ? <ManualUserForm onSubmit={handleManualSubmit} /> : null}
    </div>
  );
}

function SearchResults({ users, onSelect }: Readonly<{ users: readonly AdminUser[]; onSelect: (user: AdminUser) => void }>) {
  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
      {users.map((user) => (
        <button key={user.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50" onMouseDown={() => onSelect(user)}>
          <span className="truncate">{user.email}</span>
          <span className="shrink-0 text-xs text-gray-400">#{user.id}</span>
        </button>
      ))}
    </div>
  );
}

function ManualUserForm({ onSubmit }: Readonly<{ onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) {
  return (
    <form className="flex gap-2" onSubmit={onSubmit}>
      <input className="admin-input flex-1" name="manual_user_id" placeholder="用户 ID" type="number" min="1" />
      <button className="admin-button" type="submit">查询</button>
    </form>
  );
}

async function refreshWalletAndLedger(
  userId: number,
  setWalletState: (state: LoadState<WalletState | null>) => void,
  setLedgerState: (state: LoadState<readonly LedgerItem[]>) => void,
) {
  setWalletState({ loading: true, data: null, error: "" });
  setLedgerState({ loading: true, data: [], error: "" });
  try {
    const [wallet, ledger] = await Promise.all([adminApi.wallet(userId), adminApi.walletLedger(userId)]);
    setWalletState({ loading: false, data: wallet, error: "" });
    setLedgerState({ loading: false, data: ledger, error: "" });
  } catch (nextError) {
    const message = errorMessage(nextError, "读取钱包与账本失败");
    setWalletState({ loading: false, data: null, error: message });
    setLedgerState({ loading: false, data: [], error: message });
    throw nextError;
  }
}
