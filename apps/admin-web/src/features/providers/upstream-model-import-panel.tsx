"use client";

import { useState } from "react";

import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
type UpstreamModel = Awaited<ReturnType<typeof adminApi.fetchUpstreamModels>>[number];

function toNumber(value: FormDataEntryValue | null) {
  return Number(String(value ?? "0"));
}

function toOptionalString(value: FormDataEntryValue | null) {
  const nextValue = String(value ?? "").trim();
  return nextValue || undefined;
}

function selectedModelIds(formData: FormData) {
  return formData.getAll("model_ids").map((value) => String(value));
}

export function UpstreamModelImportPanel({
  providers,
  onImported,
  onError,
}: {
  providers: readonly Provider[];
  onImported: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [models, setModels] = useState<readonly UpstreamModel[]>([]);
  const [lastUrl, setLastUrl] = useState("");
  const [lastApiKeyEnv, setLastApiKeyEnv] = useState("");

  async function fetchModels(formData: FormData) {
    try {
      const url = String(formData.get("url") ?? "");
      const apiKeyEnv = toOptionalString(formData.get("api_key_env"));
      const nextModels = await adminApi.fetchUpstreamModels({
        url,
        api_key_env: apiKeyEnv,
      });
      setModels(nextModels);
      setLastUrl(url);
      setLastApiKeyEnv(apiKeyEnv ?? "");
    } catch (error) {
      onError(error instanceof Error ? error.message : "拉取模型列表失败");
    }
  }

  async function importModels(formData: FormData) {
    try {
      const importedModels = await adminApi.importUpstreamModels({
        url: String(formData.get("url") ?? ""),
        api_key_env: toOptionalString(formData.get("api_key_env")),
        provider_id: toNumber(formData.get("provider_id")),
        model_ids: selectedModelIds(formData),
        capability: String(formData.get("capability") ?? "image"),
        public_enabled: formData.get("public_enabled") === "on",
        member_price_cents: toNumber(formData.get("member_price_cents")),
        anonymous_price_cents: toNumber(formData.get("anonymous_price_cents")),
      });
      await onImported(`已导入 ${importedModels.length} 个模型`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "导入模型失败");
    }
  }

  return (
    <Panel title="上游模型同步" description="输入上游 `/models` 地址，拉取模型后选择导入到当前项目。">
      <form className="grid gap-3" action={fetchModels}>
        <input className="admin-input" name="url" placeholder="例如 https://api.example.com/v1/models" />
        <input className="admin-input" name="api_key_env" placeholder="API 密钥环境变量名，可留空" />
        <button className="admin-button" type="submit">
          拉取模型列表
        </button>
      </form>

      {models.length > 0 ? (
        <form className="mt-4 grid gap-3" action={importModels}>
          <input name="url" type="hidden" value={lastUrl} />
          <input name="api_key_env" type="hidden" value={lastApiKeyEnv} />
          <select className="admin-input" name="provider_id" defaultValue={providers[0]?.id ?? ""} required>
            <option value="" disabled>
              选择写入的供应商
            </option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <div className="grid max-h-72 gap-2 overflow-auto rounded-2xl border border-gray-100 bg-gray-50/60 p-2">
            {models.map((model) => (
              <label key={model.id} className="admin-card flex items-center gap-3 text-sm">
                <input name="model_ids" type="checkbox" value={model.id} />
                <span className="font-medium text-gray-700">{model.display_name}</span>
                <span className="ml-auto text-xs text-gray-400">{model.id}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select className="admin-input" name="capability" defaultValue="image">
              <option value="image">图像模型</option>
              <option value="chat">对话模型</option>
              <option value="text">文本模型</option>
            </select>
            <input className="admin-input" name="member_price_cents" type="number" min="0" placeholder="会员价（分）" />
            <input className="admin-input" name="anonymous_price_cents" type="number" min="0" placeholder="匿名价（分）" />
          </div>
          <label className="admin-checkbox-card">
            <input name="public_enabled" type="checkbox" defaultChecked />
            <span className="font-medium">导入后前台公开售卖</span>
          </label>
          <button className="admin-button" type="submit" disabled={providers.length === 0}>
            导入选中模型
          </button>
        </form>
      ) : null}
    </Panel>
  );
}
