"use client";

import { useCallback, useRef, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { Panel } from "@/features/ui/panel";
import { adminApi, type AdminUser } from "@/lib/admin-api";
import { useToast } from "@/lib/toast-context";

type WalletState = Readonly<{
  balance_cents: number;
  balance_credits: number;
  locked_cents: number;
  locked_credits: number;
  currency: string;
}>;

type LedgerItem = Awaited<ReturnType<typeof adminApi.walletLedger>>[number];

export function BillingPage() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [ledger, setLedger] = useState<readonly LedgerItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const toast = useToast();

  async function refresh(userId: number) {
    const [nextWallet, nextLedger] = await Promise.all([
      adminApi.wallet(userId),
      adminApi.walletLedger(userId),
    ]);
    setCurrentUserId(userId);
    setWallet(nextWallet);
    setLedger(nextLedger);
  }

  async function handleSelectUser(userId: number) {
    try {
      await refresh(userId);
      toast.info(`已读取用户 ${userId} 的钱包与账本`);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "查询失败");
    }
  }

  async function handleAdjust(formData: FormData) {
    if (!currentUserId) {
      toast.error("请先查询用户后再调账");
      return;
    }
    try {
      const amountCents = Number(formData.get("amount_cents") ?? "0");
      const reason = String(formData.get("reason") ?? "");
      await adminApi.adjustWallet(currentUserId, { amount_cents: amountCents, reason });
      await refresh(currentUserId);
      toast.success(`已为用户 ${currentUserId} 写入调账 ${amountCents / 10} 额度`);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "调账失败");
    }
  }

  return (
    <AdminShell
      title="钱包与账本"
      description="后台现在可以查余额、看 ledger，并执行管理员手工调账。"
    >
      <div className="col-span-12 xl:col-span-4 grid gap-4 content-start">
        <Panel title="按用户查询钱包" description="搜索用户或输入 ID 查询">
          <UserSearchInput onSelect={handleSelectUser} />
          {wallet ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="admin-card text-center">
                <p className="text-xs text-gray-400">余额</p>
                <p className="text-sm font-semibold mt-0.5">{wallet.balance_credits} 额度</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-xs text-gray-400">冻结</p>
                <p className="text-sm font-semibold mt-0.5">{wallet.locked_credits} 额度</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-xs text-gray-400">币种</p>
                <p className="text-sm font-semibold mt-0.5">{wallet.currency}</p>
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel title="管理员调账" description="正数加款，负数扣款">
          <form className="grid gap-3" action={handleAdjust}>
            <input className="admin-input" name="amount_cents" placeholder="例如 100 或 -50 分，10 额度 = 100 分" type="number" />
            <input className="admin-input" name="reason" placeholder="manual_credit / manual_debit" />
            <button className="admin-button" type="submit" disabled={!currentUserId}>写入调账</button>
          </form>
        </Panel>
      </div>

      <div className="col-span-12 xl:col-span-8 grid gap-4 content-start">
        <Panel title="账本流水" description="排查注册赠送、任务扣费、管理员调账等余额变化">
          {ledger.length === 0 ? (
            <div className="admin-card text-gray-400 text-sm">
              先查询一个用户，或该用户当前还没有可显示的账本记录。
            </div>
          ) : (
            <div className="grid gap-2">
              {ledger.map((item) => (
                <div key={item.id} className="admin-card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {item.reason} · <span className={item.amount_cents >= 0 ? "text-emerald-600" : "text-red-600"}>{item.amount_cents >= 0 ? "+" : ""}{item.amount_credits} 额度</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.reference_type}:{item.reference_id}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 shrink-0">{item.created_at}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}

function UserSearchInput({ onSelect }: Readonly<{ onSelect: (userId: number) => void }>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly AdminUser[]>([]);
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    adminApi.users({ q: q.trim(), pageSize: 5 })
      .then((res) => { setResults(res.items); setOpen(res.items.length > 0); })
      .catch(() => {});
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(user: AdminUser) {
    setQuery(`${user.email} (#${user.id})`);
    setOpen(false);
    onSelect(user.id);
  }

  function handleManualSubmit(formData: FormData) {
    const userId = Number(formData.get("manual_user_id") ?? "0");
    if (userId > 0) onSelect(userId);
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <input
          className="admin-input"
          placeholder="搜索用户邮箱或名称..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
            {results.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                onMouseDown={() => handleSelect(user)}
              >
                <span className="truncate">{user.email}</span>
                <span className="shrink-0 text-xs text-gray-400">#{user.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="text-xs text-blue-600 hover:underline text-left" onClick={() => setManualMode(!manualMode)}>
        {manualMode ? "收起手动输入" : "手动输入用户 ID"}
      </button>
      {manualMode && (
        <form className="flex gap-2" action={handleManualSubmit}>
          <input className="admin-input flex-1" name="manual_user_id" placeholder="用户 ID" type="number" min="1" />
          <button className="admin-button" type="submit">查询</button>
        </form>
      )}
    </div>
  );
}
