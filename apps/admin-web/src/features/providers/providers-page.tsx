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

function StatusPanel({ message, error }: { message: string; error: string }) {
  return (
    <div className="col-span-12 grid gap-2">
      {message ? <div className="admin-card text-emerald-700">{message}</div> : null}
      {error ? <ErrorBox message={error} /> : null}
    </div>
  );
}

export function ProvidersPage() {
  const [providers, setProviders] = useState<readonly Provider[]>([]);
  const [models, setModels] = useState<readonly SellableModel[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      <div className="col-span-12 xl:col-span-4">
        <div className="grid gap-4">
          <ProviderCreatePanel onCreated={sync} />
          <UpstreamModelImportPanel providers={providers} onImported={sync} onError={showError} />
          <ModelCreatePanel providers={providers} onCreated={sync} />
        </div>
      </div>

      <div className="col-span-12 xl:col-span-8">
        <div className="grid gap-4">
          <ProviderListPanel providers={providers} onDeleted={sync} onError={showError} />
          <ModelListPanel models={models} providers={providers} onUpdated={sync} onError={showError} />
        </div>
      </div>

      <StatusPanel message={message} error={error} />
    </AdminShell>
  );
}
