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
    <div className="grid gap-6">
      <section>
        <h1 className="text-3xl font-bold text-slate-950">个人中心</h1>
        <p className="mt-2 text-slate-500">管理您的账户信息、钱包额度与安全设置</p>
      </section>
      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <div className="grid content-start gap-6">
          {renderProfileCard(props.session)}
          {renderPersonalInfoCard(props.session)}
          {renderSecurityCard()}
        </div>
        <div className="grid content-start gap-6">
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
    <section className="rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-600 to-violet-600 text-2xl font-bold text-white">
          {getUserInitial(session.user)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{getDisplayName(session.user)}</h2>
          <p className="truncate text-sm text-slate-500">{session.user.email}</p>
        </div>
      </div>
      <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
        账户 ID：{getAccountId(session.user)}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white" type="button">编辑资料</button>
        <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800" type="button">安全设置</button>
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
    <section className="grid gap-3 rounded-[28px] border border-white/80 bg-white p-5 shadow-sm sm:grid-cols-4">
      {items.map(([label, value]) => <OverviewMetric label={label} value={value} key={label} />)}
    </section>
  );
}

export function renderPersonalInfoCard(session: AccountSession) {
  return <InfoCard title="个人信息" rows={[["昵称", getDisplayName(session.user)], ["绑定邮箱", session.user.email], ["注册时间", "已记录"]]} />;
}

export function renderSecurityCard() {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
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
    <section className="rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">最近任务</h2>
      <div className="mt-4 grid gap-3">{renderTaskList(tasksState, tasks)}</div>
    </section>
  );
}

export function renderBillingLedgerCard(ledgerState: ResourceState<readonly WalletLedgerItem[]>) {
  const items = ledgerState.status === "ready" ? ledgerState.data : [];
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">消费明细</h2>
      <div className="mt-4 overflow-x-auto">
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
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-500">{props.label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{props.value}</p>
    </div>
  );
}

function InfoCard(props: Readonly<{ rows: readonly (readonly [string, string])[]; title: string }>) {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">{props.title}</h2>
      <dl className="mt-4 grid gap-3">
        {props.rows.map(([label, value]) => <InfoRow label={label} value={value} key={label} />)}
      </dl>
    </section>
  );
}

function InfoRow(props: Readonly<{ label: string; value: string }>) {
  return <div className="flex justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm"><dt className="font-semibold text-slate-500">{props.label}</dt><dd className="truncate font-bold text-slate-900">{props.value}</dd></div>;
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
    <div className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-3" key={task.id}>
      <span className="size-12 rounded-2xl bg-gradient-to-br from-cyan-200 to-violet-200" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{task.title || task.prompt}</p>
        <p className="mt-1 text-xs text-slate-500">{formatDateTime(task.created_at ?? "")}</p>
      </div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{getTaskStatusLabel(task.status)}</span>
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

function renderLedgerRow(item: WalletLedgerItem) {
  return <tr className="text-slate-700" key={item.id}><td className="border-b border-slate-100 py-3">{formatDateTime(item.created_at)}</td><td className="border-b border-slate-100 py-3">任务消耗</td><td className="border-b border-slate-100 py-3">{item.reason}</td><td className="border-b border-slate-100 py-3">{item.amount_credits}</td><td className="border-b border-slate-100 py-3">{formatCurrency(item.amount_cents / 100, "CNY")}</td><td className="border-b border-slate-100 py-3">{formatCredits(item.balance_after_credits ?? 0)}</td><td className="border-b border-slate-100 py-3">已完成</td></tr>;
}

function getWalletBalanceLabel(state: AccountResources["walletState"]) {
  return state.status === "ready" ? formatCurrency(state.data.balance_cents / 100, state.data.currency) : "读取中";
}

function getTaskCountLabel(state: AccountResources["tasksState"]) {
  return state.status === "ready" ? String(countCurrentMonthTasks(state.data)) : "读取中";
}
