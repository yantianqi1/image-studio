"use client";

import { useState } from "react";

import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];

const DEFAULT_PROVIDER_TYPE = "openai-compatible";

function toOptionalString(value: FormDataEntryValue | null) {
  const nextValue = String(value ?? "").trim();
  return nextValue || undefined;
}

export function ProviderCreatePanel({
  onCreated,
}: {
  onCreated: (message: string) => Promise<void>;
}) {
  return (
    <Panel title="新增供应商" description="创建新的模型服务供应商。">
      <form
        className="grid gap-3"
        action={async (formData) => {
          const provider = await adminApi.createProvider({
            name: String(formData.get("name") ?? ""),
            type: String(formData.get("type") ?? DEFAULT_PROVIDER_TYPE),
            base_url: toOptionalString(formData.get("base_url")),
            api_key_env: toOptionalString(formData.get("api_key_env")),
            default_model: toOptionalString(formData.get("default_model")),
          });
          await onCreated(`供应商 ${provider.name} 已创建`);
        }}
      >
        <input className="admin-input" name="name" placeholder="供应商名称，例如 wdapi" />
        <select className="admin-input" name="type" defaultValue={DEFAULT_PROVIDER_TYPE}>
          <option value={DEFAULT_PROVIDER_TYPE}>OpenAI 兼容接口</option>
          <option value="openai-chat-compatible">OpenAI 对话兼容接口</option>
          <option value="openrouter-chat-image">OpenRouter 图片接口</option>
          <option value="local-dev">本地开发接口</option>
        </select>
        <input className="admin-input" name="base_url" placeholder="接口地址，例如 https://api.example.com/v1" />
        <input className="admin-input" name="api_key_env" placeholder="密钥环境变量名，可留空" />
        <input className="admin-input" name="default_model" placeholder="默认模型名，例如 gpt-4.1-mini" />
        <button className="admin-button" type="submit">
          创建供应商
        </button>
      </form>
    </Panel>
  );
}

export function ProviderListPanel({
  providers,
  onDeleted,
  onError,
}: {
  providers: readonly Provider[];
  onDeleted: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <Panel title="供应商列表" description="查看当前已配置的模型服务供应商。">
      <div className="grid gap-2">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} onDeleted={onDeleted} onError={onError} />
        ))}
        {providers.length === 0 ? (
          <div className="admin-card text-gray-400 text-sm">暂无供应商</div>
        ) : null}
      </div>
    </Panel>
  );
}

function ProviderCard({
  provider,
  onDeleted,
  onError,
}: {
  provider: Provider;
  onDeleted: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <div className="admin-card grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{provider.name}</span>
        <span className={providerStatusClass(provider.status)}>{providerStatusText(provider.status)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div>
          <span className="text-gray-300">接口类型</span> {providerTypeText(provider.type)}
        </div>
        <div className="col-span-2 truncate">
          <span className="text-gray-300">接口地址</span> {provider.base_url || "-"}
        </div>
        <div className="col-span-2 truncate">
          <span className="text-gray-300">密钥变量</span> {provider.api_key_env || "-"}
        </div>
        <div className="truncate">
          <span className="text-gray-300">默认模型</span> {provider.default_model || "-"}
        </div>
      </div>
      <button
        className="admin-button border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        type="button"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm(`确认删除供应商 ${provider.name}？`)) return;
          setPending(true);
          try {
            await adminApi.deleteProvider(provider.id);
            await onDeleted(`供应商 ${provider.name} 已删除`);
          } catch (error) {
            onError(error instanceof Error ? error.message : "删除供应商失败");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "删除中..." : "删除供应商"}
      </button>
    </div>
  );
}

function providerStatusClass(status: string) {
  const tone = status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500";
  return `text-xs px-2 py-0.5 rounded-full ${tone}`;
}

function providerStatusText(status: string) {
  return status === "active" ? "启用中" : "已停用";
}

function providerTypeText(type: string) {
  if (type === "openai-compatible") {
    return "OpenAI 兼容接口";
  }
  if (type === "openai-chat-compatible") {
    return "OpenAI 对话兼容接口";
  }
  if (type === "openrouter-chat-image") {
    return "OpenRouter 图片接口";
  }
  if (type === "local-dev") {
    return "本地开发接口";
  }
  return type;
}
