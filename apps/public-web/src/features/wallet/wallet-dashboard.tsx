"use client";

import { useState } from "react";

import { AppShell } from "@/features/shell/app-shell";
import { ErrorMessage } from "@/features/ui/error-message";
import { FormField } from "@/features/ui/form-field";
import { SectionPanel } from "@/features/ui/section-panel";
import { StatusCard } from "@/features/ui/status-card";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { isUnauthorizedApiError } from "@/lib/api-client";
import { publicApi } from "@/lib/public-api";
import { useApiResource } from "@/lib/use-api-resource";

const UNAUTHORIZED_STATUS = 401;

type RedeemState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "unauthorized" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; balance: number }>;

export function WalletDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>({
    status: "idle",
  });
  const walletState = useApiResource(
    () => publicApi.getWalletSummary(),
    refreshKey,
  );
  const ledgerState = useApiResource(
    () => publicApi.getWalletLedger(),
    refreshKey,
  );

  const currency = walletState.status === "ready"
    ? walletState.data.currency
    : "CNY";
  const walletUnauthorized = walletState.status === "error" && walletState.statusCode === UNAUTHORIZED_STATUS;
  const ledgerUnauthorized = ledgerState.status === "error" && ledgerState.statusCode === UNAUTHORIZED_STATUS;
  const canRedeem = !walletUnauthorized;
  const redeemButtonLabel = getRedeemButtonLabel({ canRedeem, redeemState });

  async function handleRedeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRedeemState({ status: "submitting" });

    try {
      const result = await publicApi.redeemCode({ code: redeemCode });
      setRedeemCode("");
      setRedeemState({
        status: "success",
        balance: result.balance_cents,
      });
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      if (isUnauthorizedApiError(error)) {
        setRedeemState({ status: "unauthorized" });
        return;
      }
      const message = error instanceof Error ? error.message : "兑换失败";
      setRedeemState({ status: "error", message });
    }
  }

  return (
    <AppShell activeHref="/wallet" title="我的钱包">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* 左侧：余额 + 兑换 */}
        <div className="grid gap-4 content-start">
          <SectionPanel title="余额概览">
            {walletState.status === "loading" ? (
              <StatusCard
                title="加载中"
                description="正在拉取钱包余额..."
                tone="loading"
              />
            ) : null}
            {walletUnauthorized ? (
              <StatusCard
                title="未登录"
                description="登录后可以查看钱包余额。"
                tone="neutral"
              />
            ) : null}
            {walletState.status === "error" && !walletUnauthorized ? (
              <ErrorMessage
                message={walletState.message}
                title="余额读取失败"
              />
            ) : null}
            {walletState.status === "ready" ? (
              <div className="metric-card text-center">
                <p className="eyebrow">AVAILABLE</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
                  {formatCurrency(walletState.data.balance_cents / 100, currency)}
                </p>
                <p className="text-xs text-gray-400 mt-1">{currency}</p>
              </div>
            ) : null}
          </SectionPanel>

          <SectionPanel title="兑换额度">
            <form className="grid gap-3" onSubmit={handleRedeem}>
              <FormField
                label="兑换码"
                value={redeemCode}
                onChange={(event) => setRedeemCode(event.target.value)}
                placeholder="输入充值兑换码"
                required
              />
              <button
                className="primary-button"
                type="submit"
                disabled={!canRedeem || redeemState.status === "submitting"}
              >
                {redeemButtonLabel}
              </button>
            </form>
            <div className="mt-3 grid gap-2">
              {redeemState.status === "unauthorized" ? (
                <StatusCard
                  title="未登录"
                  description="登录后才能兑换额度。"
                  tone="neutral"
                />
              ) : null}
              {redeemState.status === "error" ? (
                <ErrorMessage message={redeemState.message} />
              ) : null}
              {redeemState.status === "success" ? (
                <div className="list-card border-emerald-200 bg-emerald-50/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">兑换成功</p>
                  <p className="text-sm font-medium mt-1">
                    最新余额 {formatCurrency(redeemState.balance / 100, currency)}
                  </p>
                </div>
              ) : null}
            </div>
          </SectionPanel>
        </div>

        {/* 右侧：账本列表 */}
        <div className="grid gap-4 content-start">
          <SectionPanel title="账本列表">
            {ledgerState.status === "loading" ? (
              <StatusCard
                title="账本加载中"
                description="正在读取流水记录..."
                tone="loading"
              />
            ) : null}
            {ledgerUnauthorized ? (
              <StatusCard
                title="未登录"
                description="登录后可以查看账本流水。"
                tone="neutral"
              />
            ) : null}
            {ledgerState.status === "error" && !ledgerUnauthorized ? (
              <ErrorMessage message={ledgerState.message} title="账本读取失败" />
            ) : null}
            {ledgerState.status === "ready" && ledgerState.data.length === 0 ? (
              <StatusCard
                title="暂无流水"
                description="还没有任何交易记录"
                tone="empty"
              />
            ) : null}
            {ledgerState.status === "ready" && ledgerState.data.length > 0 ? (
              <div className="grid gap-2">
                {ledgerState.data.map((item) => (
                  <div key={item.id} className="list-card flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.reason}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(item.created_at)}</p>
                    </div>
                    <p className={`text-sm font-bold shrink-0 ${
                      item.amount_cents >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {item.amount_cents >= 0 ? "+" : ""}{formatCurrency(item.amount_cents / 100, currency)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </SectionPanel>
        </div>
      </div>
    </AppShell>
  );
}

function getRedeemButtonLabel(options: Readonly<{ canRedeem: boolean; redeemState: RedeemState }>) {
  if (!options.canRedeem) {
    return "登录后兑换";
  }
  return options.redeemState.status === "submitting" ? "兑换中..." : "立即兑换";
}
