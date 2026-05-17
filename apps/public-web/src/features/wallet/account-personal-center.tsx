import { ShieldCheck } from "lucide-react";

import { ErrorMessage } from "@/features/ui/error-message";
import { StatusCard } from "@/features/ui/status-card";
import type { ImageGenerationResponse, WalletLedgerItem } from "@/lib/public-api";
import { formatCredits, formatCurrency, formatDateTime } from "@/lib/formatters";
import type { ResourceState } from "@/lib/use-api-resource";

import type { AccountResources, AccountSession } from "./account-types";
import { RECENT_TASK_LIMIT } from "./account-types";
import {
  countCurrentMonthTasks,
  getAccountId,
  getAvailableQuotaLabel,
  getDisplayName,
  getTaskStatusLabel,
  getUserInitial,
} from "./account-utils";

export function renderPersonalCenterPage(props: Readonly<{
  resources: AccountResources;
  session: AccountSession;
}>) {
  return (
    <div className="grid gap-4 sm:gap-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">个人中心</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500 sm:mt-2 sm:text-base">管理您的账户信息、钱包额度与安全设置</p>
      </section>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[390px_1fr]">
        <div className="grid content-start gap-4 sm:gap-6">
          {renderProfileCard(props.session)}
          {renderPersonalInfoCard(props.session)}
          {renderSecurityCard()}
        </div>
        <div className="grid content-start gap-4 sm:gap-6">
          {renderAccountOverviewCard(props.resources)}
          {renderRecentTasksCard(props.resources.tasksState)}
          {renderBillingLedgerCard(props.resources.ledgerState)}
        </div>
      </div>
    </div>
  );
}

export function renderProfileCard(session: AccountSession) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-xl font-bold text-white sm:size-16 sm:rounded-3xl sm:text-2xl">
          {getUserInitial(session.user)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold sm:text-xl">{getDisplayName(session.user)}</h2>
          <p className="truncate text-sm text-slate-500">{session.user.email}</p>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600 sm:mt-5 sm:rounded-2xl sm:px-4 sm:py-3">
        账户 ID：{getAccountId(session.user)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
        <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white sm:rounded-2xl" type="button">编辑资料</button>
        <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 sm:rounded-2xl" type="button">安全设置</button>
      </div>
    </section>
  );
}

export function renderAccountOverviewCard(resources: AccountResources) {
  const walletValue = getWalletBalanceLabel(resources.walletState);
  const quotaValue = getAvailableQuotaLabel(resources.quotaState);
  const taskValue = getTaskCountLabel(resources.tasksState);
  const items = [
    ["钱包余额", walletValue],
    ["可用额度", quotaValue],
    ["本月任务总数", taskValue],
    ["计费状态", "正常"],
  ] as const;

  return (
    <section className="grid grid-cols-2 gap-2 rounded-2xl border border-white/80 bg-white p-3 shadow-sm sm:grid-cols-4 sm:gap-3 sm:rounded-[28px] sm:p-5">
      {items.map(([label, value]) => <OverviewMetric label={label} value={value} key={label} />)}
    </section>
  );
}

export function renderPersonalInfoCard(session: AccountSession) {
  return <InfoCard title="个人信息" rows={[["昵称", getDisplayName(session.user)], ["绑定邮箱", session.user.email], ["注册时间", "已记录"]]} />;
}

export function renderSecurityCard() {
  return (
    <section className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 text-blue-600" />
        <h2 className="text-lg font-bold">安全中心</h2>
      </div>
      <div className="mt-5 grid gap-3 text-sm">
        <p className="font-semibold text-slate-700">登录密码</p>
        <p className="text-slate-500">密码强度：强</p>
        <button className="w-fit rounded-full border border-slate-200 px-4 py-2 font-bold text-slate-700" type="button">修改密码</button>
        <p className="rounded-2xl bg-blue-50 px-4 py-3 text-blue-800">账户安全提示：定期更新密码并保护邮箱访问权限。</p>
      </div>
    </section>
  );
}

export function renderRecentTasksCard(tasksState: ResourceState<readonly ImageGenerationResponse[]>) {
  const tasks = tasksState.status === "ready" ? tasksState.data.slice(0, RECENT_TASK_LIMIT) : [];
  return (
    <section className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
      <h2 className="text-lg font-bold">最近任务</h2>
      <div className="mt-4 grid gap-3">{renderTaskList(tasksState, tasks)}</div>
    </section>
  );
}

export function renderBillingLedgerCard(ledgerState: ResourceState<readonly WalletLedgerItem[]>) {
  const items = ledgerState.status === "ready" ? ledgerState.data : [];
  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
      <h2 className="text-lg font-bold">消费明细</h2>
      <div className="mt-4 grid gap-3 sm:hidden">{renderLedgerMobileRows(ledgerState, items)}</div>
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <LedgerTableHead />
          <tbody>{renderLedgerRows(ledgerState, items)}</tbody>
        </table>
      </div>
    </section>
  );
}

function OverviewMetric(props: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:rounded-3xl sm:p-4">
      <p className="text-xs font-semibold text-slate-500 sm:text-sm">{props.label}</p>
      <p className="mt-1 text-base font-bold text-slate-950 sm:mt-2 sm:text-xl">{props.value}</p>
    </div>
  );
}

function InfoCard(props: Readonly<{ rows: readonly (readonly [string, string])[]; title: string }>) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
      <h2 className="text-lg font-bold">{props.title}</h2>
      <dl className="mt-4 grid gap-3">
        {props.rows.map(([label, value]) => <InfoRow label={label} value={value} key={label} />)}
      </dl>
    </section>
  );
}

function InfoRow(props: Readonly<{ label: string; value: string }>) {
  return <div className="grid gap-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:flex sm:justify-between sm:gap-4 sm:rounded-2xl sm:px-4 sm:py-3"><dt className="font-semibold text-slate-500">{props.label}</dt><dd className="truncate font-bold text-slate-900">{props.value}</dd></div>;
}

function renderTaskList(tasksState: ResourceState<readonly ImageGenerationResponse[]>, tasks: readonly ImageGenerationResponse[]) {
  if (tasksState.status === "loading") {
    return <StatusCard title="任务读取中" description="正在同步最近创作任务" tone="loading" />;
  }
  if (tasksState.status === "error") {
    return <ErrorMessage message={tasksState.message} title="任务读取失败" />;
  }
  return tasks.length > 0 ? tasks.map(renderTaskRow) : <StatusCard title="暂无任务" description="登录后的创作任务会显示在这里" tone="empty" />;
}

function renderTaskRow(task: ImageGenerationResponse) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:items-center sm:rounded-3xl" key={task.id}>
      <span className="size-10 shrink-0 rounded-xl bg-gradient-to-br from-cyan-200 to-violet-200 sm:size-12 sm:rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{task.title || task.prompt}</p>
        <p className="mt-1 text-xs text-slate-500">{formatDateTime(task.created_at ?? "")}</p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 sm:px-3">{getTaskStatusLabel(task.status)}</span>
    </div>
  );
}

function LedgerTableHead() {
  return <thead className="text-slate-400"><tr>{["时间", "类型", "内容", "消耗额度", "金额", "余额", "状态"].map((item) => <th className="border-b border-slate-100 py-3 font-semibold" key={item}>{item}</th>)}</tr></thead>;
}

function renderLedgerRows(ledgerState: ResourceState<readonly WalletLedgerItem[]>, items: readonly WalletLedgerItem[]) {
  if (ledgerState.status === "loading") {
    return <tr><td className="py-5 text-slate-500" colSpan={7}>消费记录读取中</td></tr>;
  }
  if (ledgerState.status === "error") {
    return <tr><td className="py-5 text-red-600" colSpan={7}>{ledgerState.message}</td></tr>;
  }
  return items.length > 0 ? items.map(renderLedgerRow) : <tr><td className="py-5 text-slate-500" colSpan={7}>暂无消费记录</td></tr>;
}

function renderLedgerMobileRows(ledgerState: ResourceState<readonly WalletLedgerItem[]>, items: readonly WalletLedgerItem[]) {
  if (ledgerState.status === "loading") {
    return <StatusCard title="消费记录读取中" description="正在同步账户明细" tone="loading" />;
  }
  if (ledgerState.status === "error") {
    return <ErrorMessage message={ledgerState.message} title="消费记录读取失败" />;
  }
  return items.length > 0 ? items.map(renderLedgerMobileRow) : <StatusCard title="暂无消费记录" description="账户消费会显示在这里" tone="empty" />;
}

function renderLedgerMobileRow(item: WalletLedgerItem) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm" key={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{item.reason}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">已完成</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <LedgerMobileMetric label="消耗额度" value={String(item.amount_credits)} />
        <LedgerMobileMetric label="金额" value={formatCurrency(item.amount_cents / 100, "CNY")} />
        <LedgerMobileMetric label="余额" value={formatCredits(item.balance_after_credits ?? 0)} />
        <LedgerMobileMetric label="类型" value="任务消耗" />
      </dl>
    </article>
  );
}

function LedgerMobileMetric(props: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <dt className="font-semibold text-slate-500">{props.label}</dt>
      <dd className="mt-1 truncate font-bold text-slate-900">{props.value}</dd>
    </div>
  );
}

function renderLedgerRow(item: WalletLedgerItem) {
  return <tr className="text-slate-700" key={item.id}><td className="border-b border-slate-100 py-3">{formatDateTime(item.created_at)}</td><td className="border-b border-slate-100 py-3">任务消耗</td><td className="border-b border-slate-100 py-3">{item.reason}</td><td className="border-b border-slate-100 py-3">{item.amount_credits}</td><td className="border-b border-slate-100 py-3">{formatCurrency(item.amount_cents / 100, "CNY")}</td><td className="border-b border-slate-100 py-3">{formatCredits(item.balance_after_credits ?? 0)}</td><td className="border-b border-slate-100 py-3">已完成</td></tr>;
}

function getWalletBalanceLabel(state: AccountResources["walletState"]) {
  return state.status === "ready" ? formatCurrency(state.data.balance_cents / 100, state.data.currency) : "读取中";
}

function getTaskCountLabel(state: AccountResources["tasksState"]) {
  return state.status === "ready" ? String(countCurrentMonthTasks(state.data)) : "读取中";
}
