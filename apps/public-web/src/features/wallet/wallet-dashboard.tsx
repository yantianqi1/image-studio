"use client";

import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/features/shell/app-shell";
import { ErrorMessage } from "@/features/ui/error-message";
import { FormField } from "@/features/ui/form-field";
import { SectionPanel } from "@/features/ui/section-panel";
import { StatusCard } from "@/features/ui/status-card";
import { formatCredits, formatCurrency, formatDateTime } from "@/lib/formatters";
import { isUnauthorizedApiError } from "@/lib/api-client";
import { publicApi } from "@/lib/public-api";
import type { LoginResponse, WalletLedgerItem, WalletSummary } from "@/lib/public-api";
import { type ResourceState, useApiResource } from "@/lib/use-api-resource";
import { TaskHistorySection, useWalletTaskHistory } from "./wallet-task-history";

const UNAUTHORIZED_STATUS = 401;

type RedeemState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "unauthorized" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; balanceCredits: number }>;

export function WalletDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const resources = useWalletResources(refreshKey);
  const redeem = useRedeemForm(setRefreshKey);

  const currency = resources.walletState.status === "ready"
    ? resources.walletState.data.currency
    : "CNY";
  const accountUnauthorized = isUnauthorizedState(resources.userState);
  const walletUnauthorized = isUnauthorizedState(resources.walletState);
  const ledgerUnauthorized = isUnauthorizedState(resources.ledgerState);
  const canRedeem = !walletUnauthorized;
  const redeemButtonLabel = getRedeemButtonLabel({ canRedeem, redeemState: redeem.redeemState });

  return (
    <AppShell activeHref="/wallet" title="我的钱包">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid gap-4 content-start">
          <AccountSection accountUnauthorized={accountUnauthorized} userState={resources.userState} />
          <BalanceSection currency={currency} walletState={resources.walletState} walletUnauthorized={walletUnauthorized} />
          <RedeemSection
            canRedeem={canRedeem}
            redeemButtonLabel={redeemButtonLabel}
            redeemCode={redeem.redeemCode}
            redeemState={redeem.redeemState}
            onCodeChange={redeem.setRedeemCode}
            onRedeem={redeem.handleRedeem}
          />
        </div>

        <div className="grid gap-4 content-start">
          <TaskHistorySection tasksState={resources.tasksState} />
          <LedgerSection ledgerState={resources.ledgerState} ledgerUnauthorized={ledgerUnauthorized} />
        </div>
      </div>
    </AppShell>
  );
}

function useWalletResources(refreshKey: number) {
  const walletState = useApiResource(() => publicApi.getWalletSummary(), refreshKey);
  const ledgerState = useApiResource(() => publicApi.getWalletLedger(), refreshKey);
  const userState = useApiResource(() => publicApi.getCurrentUser(), refreshKey);
  const tasksState = useWalletTaskHistory(userState, refreshKey);
  return { ledgerState, tasksState, userState, walletState };
}

function useRedeemForm(setRefreshKey: (updater: (current: number) => number) => void) {
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>({ status: "idle" });

  async function handleRedeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRedeemState({ status: "submitting" });
    try {
      const result = await publicApi.redeemCode({ code: redeemCode });
      setRedeemCode("");
      setRedeemState({ status: "success", balanceCredits: result.balance_credits });
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      if (isUnauthorizedApiError(error)) {
        setRedeemState({ status: "unauthorized" });
        return;
      }
      setRedeemState({ status: "error", message: error instanceof Error ? error.message : "兑换失败" });
    }
  }

  return { handleRedeem, redeemCode, redeemState, setRedeemCode };
}

function isUnauthorizedState(state: ResourceState<unknown>) {
  return state.status === "error" && state.statusCode === UNAUTHORIZED_STATUS;
}

function getRedeemButtonLabel(options: Readonly<{ canRedeem: boolean; redeemState: RedeemState }>) {
  if (!options.canRedeem) {
    return "登录后兑换";
  }
  return options.redeemState.status === "submitting" ? "兑换中..." : "立即兑换";
}

function AccountSection(props: Readonly<{
  accountUnauthorized: boolean;
  userState: ResourceState<LoginResponse>;
}>) {
  return (
    <SectionPanel title="账户概览">
      {props.userState.status === "loading" ? <StatusCard title="账户加载中" description="正在读取当前登录账户..." tone="loading" /> : null}
      {props.accountUnauthorized ? <AuthEntryPanel /> : null}
      {props.userState.status === "error" && !props.accountUnauthorized ? (
        <ErrorMessage message={props.userState.message} title="账户读取失败" />
      ) : null}
      {props.userState.status === "ready" ? <AccountCard user={props.userState.data} /> : null}
    </SectionPanel>
  );
}

function AccountCard({ user }: Readonly<{ user: LoginResponse }>) {
  return (
    <div className="list-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">ACCOUNT</p>
      <p className="mt-1 truncate text-base font-semibold text-gray-900">{user.display_name || user.email}</p>
      <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
    </div>
  );
}

function BalanceSection(props: Readonly<{
  currency: string;
  walletState: ResourceState<WalletSummary>;
  walletUnauthorized: boolean;
}>) {
  return (
    <SectionPanel title="额度余额">
      {props.walletState.status === "loading" ? <StatusCard title="加载中" description="正在拉取钱包余额..." tone="loading" /> : null}
      {props.walletUnauthorized ? <StatusCard title="未登录" description="登录后可以查看钱包余额。" tone="neutral" /> : null}
      {props.walletState.status === "error" && !props.walletUnauthorized ? (
        <ErrorMessage message={props.walletState.message} title="余额读取失败" />
      ) : null}
      {props.walletState.status === "ready" ? <BalanceCard currency={props.currency} wallet={props.walletState.data} /> : null}
    </SectionPanel>
  );
}

function BalanceCard(props: Readonly<{ currency: string; wallet: WalletSummary }>) {
  return (
    <div className="metric-card text-center">
      <p className="eyebrow">AVAILABLE</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{formatCredits(props.wallet.balance_credits)}</p>
      <p className="text-xs text-gray-400 mt-1">
        {formatCurrency(props.wallet.balance_cents / 100, props.currency)} · 10 额度 = ¥1.00
      </p>
    </div>
  );
}

function RedeemSection(props: Readonly<{
  canRedeem: boolean;
  redeemButtonLabel: string;
  redeemCode: string;
  redeemState: RedeemState;
  onCodeChange: (code: string) => void;
  onRedeem: (event: React.FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <SectionPanel title="兑换额度">
      <form className="grid gap-3" onSubmit={props.onRedeem}>
        <FormField
          label="兑换码"
          value={props.redeemCode}
          onChange={(event) => props.onCodeChange(event.target.value)}
          placeholder="输入充值兑换码"
          required
        />
        <button className="primary-button" type="submit" disabled={!props.canRedeem || props.redeemState.status === "submitting"}>
          {props.redeemButtonLabel}
        </button>
      </form>
      <RedeemStatePanel redeemState={props.redeemState} />
    </SectionPanel>
  );
}

function RedeemStatePanel({ redeemState }: Readonly<{ redeemState: RedeemState }>) {
  return (
    <div className="mt-3 grid gap-2">
      {redeemState.status === "unauthorized" ? <StatusCard title="未登录" description="登录后才能兑换额度。" tone="neutral" /> : null}
      {redeemState.status === "error" ? <ErrorMessage message={redeemState.message} /> : null}
      {redeemState.status === "success" ? <RedeemSuccess balanceCredits={redeemState.balanceCredits} /> : null}
    </div>
  );
}

function RedeemSuccess({ balanceCredits }: Readonly<{ balanceCredits: number }>) {
  return (
    <div className="list-card border-emerald-200 bg-emerald-50/50">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">兑换成功</p>
      <p className="text-sm font-medium mt-1">最新余额 {formatCredits(balanceCredits)}</p>
    </div>
  );
}

function LedgerSection(props: Readonly<{
  ledgerState: ResourceState<readonly WalletLedgerItem[]>;
  ledgerUnauthorized: boolean;
}>) {
  return (
    <SectionPanel title="账本列表">
      {props.ledgerState.status === "loading" ? <StatusCard title="账本加载中" description="正在读取流水记录..." tone="loading" /> : null}
      {props.ledgerUnauthorized ? <StatusCard title="未登录" description="登录后可以查看账本流水。" tone="neutral" /> : null}
      {props.ledgerState.status === "error" && !props.ledgerUnauthorized ? (
        <ErrorMessage message={props.ledgerState.message} title="账本读取失败" />
      ) : null}
      {props.ledgerState.status === "ready" ? <LedgerReadyState items={props.ledgerState.data} /> : null}
    </SectionPanel>
  );
}

function LedgerReadyState({ items }: Readonly<{ items: readonly WalletLedgerItem[] }>) {
  if (items.length === 0) {
    return <StatusCard title="暂无流水" description="还没有任何交易记录" tone="empty" />;
  }
  return <div className="grid gap-2">{items.map((item) => <LedgerItemRow key={item.id} item={item} />)}</div>;
}

function LedgerItemRow({ item }: Readonly<{ item: WalletLedgerItem }>) {
  return (
    <div className="list-card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{item.reason}</p>
        <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(item.created_at)}</p>
      </div>
      <p className={`text-sm font-bold shrink-0 ${item.amount_cents >= 0 ? "text-emerald-600" : "text-red-600"}`}>
        {item.amount_credits >= 0 ? "+" : ""}{formatCredits(item.amount_credits)}
      </p>
    </div>
  );
}

function AuthEntryPanel() {
  const [anonymousState, setAnonymousState] = useState<"idle" | "submitting">("idle");
  const [anonymousError, setAnonymousError] = useState("");

  async function continueAnonymously() {
    setAnonymousState("submitting");
    setAnonymousError("");
    try {
      await publicApi.ensureAnonymousSession();
      window.location.href = "/generate";
    } catch (error: unknown) {
      setAnonymousState("idle");
      setAnonymousError(error instanceof Error ? error.message : "匿名会话创建失败");
    }
  }

  return (
    <div className="grid gap-3">
      <StatusCard
        title="未登录"
        description="注册或登录后可以查看账户、额度和任务扣费记录。"
        tone="neutral"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link className="primary-button text-center" href="/login?mode=register">注册账户</Link>
        <Link className="secondary-button text-center" href="/login">登录账户</Link>
        <button className="secondary-button" type="button" onClick={continueAnonymously} disabled={anonymousState === "submitting"}>
          {anonymousState === "submitting" ? "进入中..." : "匿名使用"}
        </button>
      </div>
      {anonymousError ? <ErrorMessage message={anonymousError} /> : null}
    </div>
  );
}
