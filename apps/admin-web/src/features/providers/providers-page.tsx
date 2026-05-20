"use client";

import { ModelCreatePanel, ModelListPanel } from "@/features/providers/model-panels";
import { ProviderCreatePanel, ProviderListPanel } from "@/features/providers/provider-panels";
import { ProviderOverview } from "@/features/providers/provider-overview";
import { UpstreamModelImportPanel } from "@/features/providers/upstream-model-import-panel";
import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { useModels, useProviders } from "@/lib/use-admin-data";
import { useToast } from "@/lib/toast-context";
import { useState } from "react";

type Tab = "providers" | "models" | "upstream";

const TABS: { key: Tab; label: string }[] = [
  { key: "providers", label: "供应商" },
  { key: "models", label: "模型管理" },
  { key: "upstream", label: "NewAPI 同步" },
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

export function ProvidersPage() {
  const { data: providers = [], error: providersError, mutate: mutateProviders } = useProviders();
  const { data: models = [], error: modelsError, mutate: mutateModels } = useModels();
  const [activeTab, setActiveTab] = useState<Tab>("providers");
  const toast = useToast();

  async function sync(messageText: string) {
    await Promise.all([mutateProviders(), mutateModels()]);
    toast.success(messageText);
  }

  function showError(messageText: string) {
    toast.error(messageText);
  }

  const error = providersError || modelsError;

  return (
    <AdminShell
      title="NewAPI 接入"
      description="维护供应商接入、同步模型目录并配置站内可见模型。"
    >
      <div className="col-span-12 grid gap-4">
        <TabBar active={activeTab} onChange={setActiveTab} />
        {error ? <ErrorBox message={error instanceof Error ? error.message : "读取供应商配置失败"} /> : null}
        <ProviderOverview models={models} providers={providers} />

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
            <UpstreamModelImportPanel onImported={sync} onError={showError} />
          </div>
        )}
      </div>
    </AdminShell>
  );
}
