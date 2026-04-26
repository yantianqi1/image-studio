"use client";

import { useEffect, useState } from "react";

import {
  clearClientProviderConfig,
  hasCompleteClientProviderConfig,
  readStoredClientProviderConfig,
  saveClientProviderDraft,
  type ClientProviderDraft,
} from "@/lib/client-provider-config";

const EMPTY_DRAFT: ClientProviderDraft = { baseUrl: "", apiKey: "" };

export function ClientProviderControls() {
  const [draft, setDraft] = useState<ClientProviderDraft>(EMPTY_DRAFT);

  useEffect(() => {
    const stored = readStoredClientProviderConfig();
    setDraft({ baseUrl: stored.baseUrl, apiKey: stored.apiKey });
  }, []);

  function updateDraft(nextDraft: ClientProviderDraft) {
    const saved = saveClientProviderDraft(nextDraft);
    setDraft({ baseUrl: saved.baseUrl, apiKey: saved.apiKey });
  }

  function clearDraft() {
    clearClientProviderConfig();
    setDraft(EMPTY_DRAFT);
  }

  const enabled = hasCompleteClientProviderConfig(draft);

  return (
    <div className="hidden min-w-0 items-center gap-2 xl:flex">
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}
        aria-label={enabled ? "自带通道已启用" : "自带通道未启用"}
        title={enabled ? "自带通道已启用" : "填写 URL 和 Key 启用自带通道"}
      />
      <input
        className="h-9 w-52 rounded-lg border border-gray-200 bg-white/70 px-3 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-100"
        aria-label="OpenAI 兼容 URL"
        placeholder="OpenAI 兼容 URL"
        type="url"
        value={draft.baseUrl}
        onChange={(event) => updateDraft({ ...draft, baseUrl: event.target.value })}
      />
      <input
        className="h-9 w-40 rounded-lg border border-gray-200 bg-white/70 px-3 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-100"
        aria-label="OpenAI 兼容密钥"
        placeholder="API Key"
        type="password"
        value={draft.apiKey}
        onChange={(event) => updateDraft({ ...draft, apiKey: event.target.value })}
      />
      <button
        className="h-9 rounded-lg border border-gray-200 bg-white/70 px-3 text-xs font-semibold text-gray-500 transition hover:border-gray-300 hover:bg-white hover:text-gray-900"
        type="button"
        onClick={clearDraft}
      >
        清除
      </button>
    </div>
  );
}
