"use client";

import type { PublicQuotaStatus } from "@/lib/public-api";
import { usePublicQuotaStatus } from "@/lib/use-public-quota-status";

import styles from "./public-quota-status.module.css";

const FULL_PERCENT = 100;
const LOW_QUOTA_RATIO = 0.25;
const LOADING_PERCENT = 42;
const EMPTY_VALUE = "--";

export function PublicQuotaStatusBadge() {
  const state = usePublicQuotaStatus();

  if (state.status === "ready") {
    return <QuotaStatusView status={state.data} />;
  }

  if (state.status === "error") {
    return <QuotaErrorView message={state.message} />;
  }

  return <QuotaLoadingView />;
}

function QuotaStatusView({ status }: Readonly<{ status: PublicQuotaStatus }>) {
  const modeCopy = getModeCopy(status.mode);
  const tone = getQuotaTone(status);
  const title = `今日次数：剩余 ${status.remaining_count} / ${status.limit_count}，已用 ${status.used_count}`;

  return (
    <div className={styles.status} data-tone={tone} title={title} aria-label={`今日次数：剩余 ${status.remaining_count} / ${status.limit_count}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>今日次数</span>
      <span className={styles.value}>
        {status.remaining_count}
        <span className={styles.valueMuted}>/ {status.limit_count}</span>
      </span>
      <span className={styles.state}>{getQuotaStateLabel(status)}</span>
      <span className={styles.detail}>{modeCopy.label}</span>
      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} style={{ width: `${getQuotaPercent(status)}%` }} />
      </span>
    </div>
  );
}

function QuotaLoadingView() {
  return (
    <div className={styles.status} data-tone="loading" aria-label="今日次数读取中">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>今日次数</span>
      <span className={styles.value}>
        {EMPTY_VALUE}
        <span className={styles.valueMuted}>/ {EMPTY_VALUE}</span>
      </span>
      <span className={styles.state}>加载中</span>
      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} style={{ width: `${LOADING_PERCENT}%` }} />
      </span>
    </div>
  );
}

function QuotaErrorView({ message }: Readonly<{ message: string }>) {
  return (
    <div className={styles.status} data-tone="error" title={message} aria-label={`今日次数读取失败：${message}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>今日次数</span>
      <span className={styles.value}>
        {EMPTY_VALUE}
        <span className={styles.valueMuted}>/ {EMPTY_VALUE}</span>
      </span>
      <span className={styles.state}>异常</span>
      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} style={{ width: "0%" }} />
      </span>
    </div>
  );
}

function getQuotaTone(status: PublicQuotaStatus): "empty" | "healthy" | "loading" | "low" {
  if (status.exhausted) {
    return "empty";
  }
  if (status.remaining_count / status.limit_count <= LOW_QUOTA_RATIO) {
    return "low";
  }
  return "healthy";
}

function getQuotaPercent(status: PublicQuotaStatus): number {
  return Math.max(0, Math.min(FULL_PERCENT, Math.round((status.remaining_count / status.limit_count) * FULL_PERCENT)));
}

function getQuotaStateLabel(status: PublicQuotaStatus): string {
  if (status.exhausted) {
    return "已用尽";
  }
  if (status.remaining_count / status.limit_count <= LOW_QUOTA_RATIO) {
    return "余量偏低";
  }
  return "可用";
}

function getModeCopy(mode: PublicQuotaStatus["mode"]): Readonly<{ hint: string; label: string }> {
  return mode === "per_ip"
    ? { hint: "当前 IP 独立配额", label: "按 IP" }
    : { hint: "北京时间 00:00 刷新", label: "每日全站" };
}
