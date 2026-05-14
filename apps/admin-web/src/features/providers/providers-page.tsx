"use client";

import { useEffect, useState } from "react";

import { ModelCreatePanel, ModelListPanel } from "@/features/providers/model-panels";
import { ProviderCreatePanel, ProviderListPanel } from "@/features/providers/provider-panels";
import { UpstreamModelImportPanel } from "@/features/providers/upstream-model-import-panel";
import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { adminApi } from "@/lib/admin-api";

type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];

type Tab = "providers" | "models" | "upstream";

const TABS: { key: Tab; label: string }[] = [
  { key: "providers", label: "供应商" },
  { key: "models", label: "模型管理" },
  { key: "upstream", label: "上游同步" },
];

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            active === tab.key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function StatusPanel({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message ? <div className="admin-card text-emerald-700">{message}</div> : null}
      {error ? <ErrorBox message={error} /> : null}
    </>
  );
}

export function ProvidersPage() {
  const [providers, setProviders] = useState<readonly Provider[]>([]);
  const [models, setModels] = useState<readonly SellableModel[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("providers");

  async function refresh() {
    const [nextProviders, nextModels] = await Promise.all([
      adminApi.providers(),
      adminApi.models(),
    ]);
    setProviders(nextProviders);
    setModels(nextModels);
  }

  async function sync(messageText: string) {
    try {
      setError("");
      await refresh();
      setMessage(messageText);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "读取供应商配置失败");
    }
  }

  function showError(messageText: string) {
    setMessage("");
    setError(messageText);
  }

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "读取供应商配置失败");
      }
    };
    void bootstrap();
  }, []);

  return (
    <AdminShell
      title="模型与供应商管理"
      description="维护模型供应商、同步上游模型并配置售卖价格。"
    >
      <div className="col-span-12 grid gap-4">
        <TabBar active={activeTab} onChange={setActiveTab} />
        <StatusPanel message={message} error={error} />

        {activeTab === "providers" && (
          <div className="grid gap-4">
            <ProviderCreatePanel onCreated={sync} />
            <ProviderListPanel providers={providers} onDeleted={sync} onError={showError} />
          </div>
        )}

        {activeTab === "models" && (
          <div className="grid gap-4">
            <ModelCreatePanel providers={providers} onCreated={sync} />
            <ModelListPanel models={models} providers={providers} onUpdated={sync} onError={showError} />
          </div>
        )}

        {activeTab === "upstream" && (
          <div className="grid gap-4">
            <UpstreamModelImportPanel providers={providers} onImported={sync} onError={showError} />
          </div>
        )}
      </div>
    </AdminShell>
  );
}
