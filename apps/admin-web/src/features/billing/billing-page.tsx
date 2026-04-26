"use client";

import { useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

type WalletState = Readonly<{
  balance_cents: number;
  locked_cents: number;
  currency: string;
}>;

type LedgerItem = Awaited<ReturnType<typeof adminApi.walletLedger>>[number];

export function BillingPage() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [ledger, setLedger] = useState<readonly LedgerItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh(userId: number) {
    const [nextWallet, nextLedger] = await Promise.all([
      adminApi.wallet(userId),
      adminApi.walletLedger(userId),
    ]);
    setCurrentUserId(userId);
    setWallet(nextWallet);
    setLedger(nextLedger);
  }

  async function handleLookup(formData: FormData) {
    try {
      setError("");
      const userId = Number(formData.get("userId") ?? "0");
      await refresh(userId);
      setMessage(`已读取用户 ${userId} 的钱包与账本`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "查询失败");
    }
  }

  async function handleAdjust(formData: FormData) {
    if (!currentUserId) {
      setError("请先查询用户后再调账");
      return;
    }

    try {
      setError("");
      const amountCents = Number(formData.get("amount_cents") ?? "0");
      const reason = String(formData.get("reason") ?? "");
      await adminApi.adjustWallet(currentUserId, {
        amount_cents: amountCents,
        reason,
      });
      await refresh(currentUserId);
      setMessage(`已为用户 ${currentUserId} 写入调账 ${amountCents} cents`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "调账失败");
    }
  }

  return (
    <AdminShell
      title="钱包与账本"
      description="后台现在可以查余额、看 ledger，并执行管理员手工调账。"
    >
      <div className="col-span-12 xl:col-span-4 grid gap-4 content-start">
        <Panel
          title="按用户查询钱包"
          description="读取 wallets/{userId} 与 ledger"
        >
          <form className="grid gap-3" action={handleLookup}>
            <input
              className="admin-input"
              name="userId"
              placeholder="用户 ID"
              type="number"
              min="1"
            />
            <button className="admin-button" type="submit">
              查询钱包
            </button>
          </form>
          {wallet ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="admin-card text-center">
                <p className="text-xs text-gray-400">余额</p>
                <p className="text-sm font-semibold mt-0.5">{wallet.balance_cents}</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-xs text-gray-400">冻结</p>
                <p className="text-sm font-semibold mt-0.5">{wallet.locked_cents}</p>
              </div>
              <div className="admin-card text-center">
                <p className="text-xs text-gray-400">币种</p>
                <p className="text-sm font-semibold mt-0.5">{wallet.currency}</p>
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="管理员调账"
          description="正数加款，负数扣款"
        >
          <form className="grid gap-3" action={handleAdjust}>
            <input
              className="admin-input"
              name="amount_cents"
              placeholder="例如 100 或 -50"
              type="number"
            />
            <input
              className="admin-input"
              name="reason"
              placeholder="manual_credit / manual_debit"
            />
            <button className="admin-button" type="submit">
              写入调账
            </button>
          </form>
        </Panel>
      </div>

      <div className="col-span-12 xl:col-span-8 grid gap-4 content-start">
        <Panel
          title="账本流水"
          description="排查注册赠送、任务扣费、管理员调账等余额变化"
        >
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
                      {item.reason} · <span className={item.amount_cents >= 0 ? "text-emerald-600" : "text-red-600"}>{item.amount_cents >= 0 ? "+" : ""}{item.amount_cents} cents</span>
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

        <div className="grid gap-3">
          {message ? <div className="admin-card text-emerald-700">{message}</div> : null}
          {error ? <ErrorBox message={error} /> : null}
        </div>
      </div>
    </AdminShell>
  );
}
