"use client";

import { useState } from "react";

import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];
type ModelCardProps = Readonly<{
  model: SellableModel;
  providers: readonly Provider[];
  onUpdated: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>;

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
    <Panel title="新增模型" description="绑定供应商、模型名和可见性。">
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
        <PublicEnabled defaultChecked />
        <button className="admin-button" type="submit" disabled={providers.length === 0}>
          创建模型
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
    <Panel title="模型列表" description="更新供应商绑定、模型名和公开可见性。">
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
          <div className="admin-card text-gray-400 text-sm">暂无模型</div>
        ) : null}
      </div>
    </Panel>
  );
}

function ModelCard({ model, providers, onUpdated, onError }: ModelCardProps) {
  const [pending, setPending] = useState(false);
  const providerName = providers.find((provider) => provider.id === model.provider_id)?.name ?? `#${model.provider_id}`;

  async function handleUpdate(formData: FormData) {
    await updateModel({ formData, model, onError, onUpdated, setPending });
  }

  async function handleDelete() {
    await deleteModel({ model, onError, onUpdated, setPending });
  }

  return (
    <div className="admin-card grid gap-2">
      <ModelEditForm model={model} pending={pending} providerName={providerName} providers={providers} onDelete={handleDelete} onUpdate={handleUpdate} />
    </div>
  );
}

async function updateModel(props: Readonly<{
  formData: FormData;
  model: SellableModel;
  onError: (message: string) => void;
  onUpdated: (message: string) => Promise<void>;
  setPending: (pending: boolean) => void;
}>) {
  props.setPending(true);
  try {
    await adminApi.updateModel(props.model.code, buildModelUpdate(props.formData));
    await props.onUpdated(`模型 ${props.model.code} 已更新`);
  } catch (error) {
    props.onError(error instanceof Error ? error.message : "更新模型失败");
  } finally {
    props.setPending(false);
  }
}

async function deleteModel(props: Readonly<{
  model: SellableModel;
  onError: (message: string) => void;
  onUpdated: (message: string) => Promise<void>;
  setPending: (pending: boolean) => void;
}>) {
  if (!window.confirm(`确认删除模型 ${props.model.code}？`)) return;
  props.setPending(true);
  try {
    await adminApi.deleteModel(props.model.code);
    await props.onUpdated(`模型 ${props.model.code} 已删除`);
  } catch (error) {
    props.onError(error instanceof Error ? error.message : "删除模型失败");
  } finally {
    props.setPending(false);
  }
}

function buildModelUpdate(formData: FormData) {
  return {
    display_name: String(formData.get("display_name") ?? ""),
    capability: String(formData.get("capability") ?? ""),
    provider_id: toNumber(formData.get("provider_id")),
    provider_model: String(formData.get("provider_model") ?? ""),
    public_enabled: formData.get("public_enabled") === "on",
  };
}

function ModelEditForm(props: Readonly<{
  model: SellableModel;
  pending: boolean;
  providerName: string;
  providers: readonly Provider[];
  onDelete: () => void;
  onUpdate: (formData: FormData) => void;
}>) {
  return (
    <form className="grid gap-2" action={props.onUpdate}>
      <ModelHeader model={props.model} providerName={props.providerName} />
      <ModelIdentityFields model={props.model} />
      <ProviderSelect providers={props.providers} defaultValue={props.model.provider_id} />
      <input className="admin-input" name="provider_model" defaultValue={props.model.provider_model} />
      <PublicEnabled defaultChecked={props.model.public_enabled} />
      <ModelActionButtons pending={props.pending} onDelete={props.onDelete} />
    </form>
  );
}

function ModelIdentityFields({ model }: Readonly<{ model: SellableModel }>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className="admin-input" name="display_name" defaultValue={model.display_name} />
      <select className="admin-input" name="capability" defaultValue={model.capability}>
        <option value="chat">对话模型</option>
        <option value="image">图像模型</option>
        <option value="text">文本模型</option>
      </select>
    </div>
  );
}

function ModelActionButtons({ pending, onDelete }: Readonly<{ pending: boolean; onDelete: () => void }>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button className="admin-button" type="submit" disabled={pending}>
        {pending ? "保存中..." : "保存模型"}
      </button>
      <button
        className="admin-button border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        type="button"
        disabled={pending}
        onClick={onDelete}
      >
        {pending ? "处理中..." : "删除模型"}
      </button>
    </div>
  );
}

function ModelHeader({ model, providerName }: { model: SellableModel; providerName: string }) {
  const tone = model.public_enabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500";
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{model.code}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{model.display_name} · {providerName} · {model.provider_model}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>
        {model.public_enabled ? "前台可见" : "不公开"}
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

function PublicEnabled({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="admin-checkbox-card">
      <input name="public_enabled" type="checkbox" defaultChecked={defaultChecked} />
      <span className="font-medium">前台公开可见</span>
    </label>
  );
}
