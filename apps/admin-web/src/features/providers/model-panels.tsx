"use client";

import { Panel } from "@/features/ui/panel";
import { VariantPanel } from "@/features/providers/variant-panel";
import { adminApi } from "@/lib/admin-api";

type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];

function toNumber(value: FormDataEntryValue | null) {
  return Number(String(value ?? "0"));
}

export function ModelCreatePanel({
  providers,
  onCreated,
}: {
  providers: readonly Provider[];
  onCreated: (message: string) => Promise<void>;
}) {
  return (
    <Panel title="新增可售模型" description="绑定供应商、模型名和价格。">
      <form
        className="grid gap-3"
        action={async (formData) => {
          const model = await adminApi.createModel({
            code: String(formData.get("code") ?? ""),
            display_name: String(formData.get("display_name") ?? ""),
            capability: String(formData.get("capability") ?? "chat"),
            provider_id: toNumber(formData.get("provider_id")),
            provider_model: String(formData.get("provider_model") ?? ""),
            public_enabled: formData.get("public_enabled") === "on",
            member_price_cents: toNumber(formData.get("member_price_cents")),
            anonymous_price_cents: toNumber(formData.get("anonymous_price_cents")),
          });
          await onCreated(`模型 ${model.code} 已创建`);
        }}
      >
        <input className="admin-input" name="code" placeholder="例如 gpt-4.1-mini" />
        <input className="admin-input" name="display_name" placeholder="示例模型名" />
        <select className="admin-input" name="capability" defaultValue="chat">
          <option value="chat">对话模型</option>
          <option value="image">图像模型</option>
          <option value="text">文本模型</option>
        </select>
        <ProviderSelect providers={providers} defaultValue={providers[0]?.id ?? ""} />
        <input className="admin-input" name="provider_model" placeholder="供应商内真实模型名" />
        <PriceInputs />
        <PublicEnabled defaultChecked />
        <button className="admin-button" type="submit" disabled={providers.length === 0}>
          创建可售模型
        </button>
      </form>
    </Panel>
  );
}

export function ModelListPanel({
  models,
  providers,
  onUpdated,
  onError,
}: {
  models: readonly SellableModel[];
  providers: readonly Provider[];
  onUpdated: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <Panel title="可售模型列表" description="直接更新供应商绑定、模型名与价格。">
      <div className="grid gap-3">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            providers={providers}
            onUpdated={onUpdated}
            onError={onError}
          />
        ))}
        {models.length === 0 ? (
          <div className="admin-card text-gray-400 text-sm">暂无可售模型</div>
        ) : null}
      </div>
    </Panel>
  );
}

function ModelCard({
  model,
  providers,
  onUpdated,
  onError,
}: {
  model: SellableModel;
  providers: readonly Provider[];
  onUpdated: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <div className="admin-card grid gap-2">
      <form
        className="grid gap-2"
        action={async (formData) => {
          await adminApi.updateModel(model.code, {
            display_name: String(formData.get("display_name") ?? ""),
            capability: String(formData.get("capability") ?? ""),
            provider_id: toNumber(formData.get("provider_id")),
            provider_model: String(formData.get("provider_model") ?? ""),
            public_enabled: formData.get("public_enabled") === "on",
            member_price_cents: toNumber(formData.get("member_price_cents")),
            anonymous_price_cents: toNumber(formData.get("anonymous_price_cents")),
          });
          await onUpdated(`模型 ${model.code} 已更新`);
        }}
      >
        <ModelHeader model={model} />
        <div className="grid grid-cols-2 gap-2">
          <input className="admin-input" name="display_name" defaultValue={model.display_name} />
          <select className="admin-input" name="capability" defaultValue={model.capability}>
            <option value="chat">对话模型</option>
            <option value="image">图像模型</option>
            <option value="text">文本模型</option>
          </select>
        </div>
        <ProviderSelect providers={providers} defaultValue={model.provider_id} />
        <input className="admin-input" name="provider_model" defaultValue={model.provider_model} />
        <PriceInputs model={model} />
        <PublicEnabled defaultChecked={model.public_enabled} />
        <div className="grid grid-cols-2 gap-2">
          <button className="admin-button" type="submit">保存模型</button>
          <button
            className="admin-button border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            type="button"
            onClick={async () => {
              if (!window.confirm(`确认删除模型 ${model.code}？`)) {
                return;
              }
              try {
                await adminApi.deleteModel(model.code);
                await onUpdated(`模型 ${model.code} 已删除`);
              } catch (error) {
                onError(error instanceof Error ? error.message : "删除模型失败");
              }
            }}
          >
            删除模型
          </button>
        </div>
      </form>
      <VariantPanel model={model} onMessage={(msg) => onUpdated(msg)} onError={onError} />
    </div>
  );
}

function ModelHeader({ model }: { model: SellableModel }) {
  const tone = model.public_enabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-sm">{model.code}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>
        {model.public_enabled ? "公开售卖" : "不公开"}
      </span>
    </div>
  );
}

function ProviderSelect({ providers, defaultValue }: { providers: readonly Provider[]; defaultValue: number | string }) {
  return (
    <select className="admin-input" name="provider_id" defaultValue={defaultValue} required>
      <option value="" disabled>选择供应商</option>
      {providers.map((provider) => (
        <option key={provider.id} value={provider.id}>{provider.name}</option>
      ))}
    </select>
  );
}

function PriceInputs({ model }: { model?: SellableModel }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className="admin-input" name="member_price_cents" type="number" min="0" placeholder="会员价（分）" defaultValue={model?.member_price_cents} />
      <input className="admin-input" name="anonymous_price_cents" type="number" min="0" placeholder="匿名价（分）" defaultValue={model?.anonymous_price_cents} />
    </div>
  );
}

function PublicEnabled({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="admin-checkbox-card">
      <input name="public_enabled" type="checkbox" defaultChecked={defaultChecked} />
      <span className="font-medium">前台公开售卖</span>
    </label>
  );
}
