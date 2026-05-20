"use client";

import { useState } from "react";

import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

type SyncedModel = Awaited<ReturnType<typeof adminApi.syncNewApiModels>>[number];

export function UpstreamModelImportPanel({
  onError,
  onImported,
}: {
  onImported: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [models, setModels] = useState<readonly SyncedModel[]>([]);

  async function syncModels() {
    try {
      const nextModels = await adminApi.syncNewApiModels();
      setModels(nextModels);
      await onImported(`已同步 ${nextModels.length} 个 NewAPI 模型`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "同步 NewAPI 模型失败");
    }
  }

  return (
    <Panel title="NewAPI 模型同步" description="从 NewAPI 拉取最新模型目录并更新站内模型。">
      <div className="grid gap-3">
        <button className="admin-button" type="button" onClick={() => void syncModels()}>
          同步 NewAPI 模型
        </button>
        {models.length > 0 ? (
          <div className="grid max-h-72 gap-2 overflow-auto rounded-2xl border border-gray-100 bg-gray-50/60 p-2">
            {models.map((model) => (
              <div key={model.id} className="admin-card flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-700">{model.display_name}</span>
                <span className="ml-auto text-xs text-gray-400">{model.code}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
