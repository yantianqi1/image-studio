"use client";

import { useSyncExternalStore } from "react";

import {
  CLIENT_PROVIDER_DRAFT_CHANGED_EVENT,
  clearClientProviderConfig,
  hasCompleteClientProviderConfig,
  readStoredClientProviderConfig,
  saveClientProviderDraft,
  type ClientProviderDraft,
} from "@/lib/client-provider-config";
import styles from "./provider-settings-popover.module.css";

const EMPTY_DRAFT: ClientProviderDraft = { baseUrl: "", apiKey: "" };
const EMPTY_DRAFT_SNAPSHOT = JSON.stringify(EMPTY_DRAFT);

export function ProviderSettingsPopover() {
  const draft = parseClientProviderDraftSnapshot(useClientProviderDraftSnapshot());
  const enabled = hasCompleteClientProviderConfig(draft);

  function updateDraft(nextDraft: ClientProviderDraft) {
    saveClientProviderDraft(nextDraft);
    notifyClientProviderDraftChanged();
  }

  function clearDraft() {
    clearClientProviderConfig();
    notifyClientProviderDraftChanged();
  }

  return (
    <details className={styles.popover}>
      <summary className={styles.trigger} aria-label="通道设置">
        <span className={styles.statusDot} data-enabled={enabled ? "true" : "false"} aria-hidden="true" />
        <span className={styles.triggerText}>通道设置</span>
      </summary>
      <div className={styles.panel}>
        <SettingsHeader enabled={enabled} />
        <ProviderSettingsForm draft={draft} onClear={clearDraft} onDraftChange={updateDraft} />
      </div>
    </details>
  );
}

function SettingsHeader({ enabled }: Readonly<{ enabled: boolean }>) {
  return (
    <div className={styles.panelHeader}>
      <div>
        <h2 className={styles.panelTitle}>通道设置</h2>
        <p className={styles.panelDescription}>自有 OpenAI 兼容通道</p>
      </div>
      <span className={styles.statePill} data-enabled={enabled ? "true" : "false"}>
        {enabled ? "已启用" : "未启用"}
      </span>
    </div>
  );
}

function ProviderSettingsForm({
  draft,
  onClear,
  onDraftChange,
}: Readonly<{
  draft: ClientProviderDraft;
  onClear: () => void;
  onDraftChange: (draft: ClientProviderDraft) => void;
}>) {
  return (
    <div className={styles.form}>
      <SettingsField
        label="OpenAI 兼容 URL（可选）"
        type="url"
        value={draft.baseUrl}
        onChange={(baseUrl) => onDraftChange({ ...draft, baseUrl })}
      />
      <SettingsField
        label="API Key"
        type="password"
        value={draft.apiKey}
        onChange={(apiKey) => onDraftChange({ ...draft, apiKey })}
      />
      <button className={styles.clearButton} type="button" onClick={onClear}>
        清除
      </button>
    </div>
  );
}

function SettingsField({
  label,
  type,
  value,
  onChange,
}: Readonly<{
  label: string;
  type: "password" | "url";
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        aria-label={label}
        placeholder={label}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function useClientProviderDraftSnapshot(): string {
  return useSyncExternalStore(
    subscribeClientProviderDraft,
    readClientProviderDraft,
    () => EMPTY_DRAFT_SNAPSHOT,
  );
}

function readClientProviderDraft(): string {
  const stored = readStoredClientProviderConfig();
  return JSON.stringify({ baseUrl: stored.baseUrl, apiKey: stored.apiKey });
}

function parseClientProviderDraftSnapshot(snapshot: string): ClientProviderDraft {
  return JSON.parse(snapshot) as ClientProviderDraft;
}

function subscribeClientProviderDraft(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CLIENT_PROVIDER_DRAFT_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CLIENT_PROVIDER_DRAFT_CHANGED_EVENT, onStoreChange);
  };
}

function notifyClientProviderDraftChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(CLIENT_PROVIDER_DRAFT_CHANGED_EVENT));
}
