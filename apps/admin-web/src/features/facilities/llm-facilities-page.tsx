"use client";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { SubmitButton } from "@/features/ui/submit-button";
import { adminApi, type AdminLlmFeatureModel, type AdminLlmFeatureSetting } from "@/lib/admin-api";
import { useToast } from "@/lib/toast-context";
import { useLlmFacilities } from "@/lib/use-admin-data";
import { useState } from "react";

const INPUT_MODE_LABELS: Record<AdminLlmFeatureSetting["input_mode"], string> = {
  image: "图像",
  multimodal: "多模态",
  text: "文本",
};

export function LlmFacilitiesPage() {
  const { data, error: loadError, mutate } = useLlmFacilities();
  const [error, setError] = useState("");
  const toast = useToast();

  async function handleSave(formData: FormData) {
    if (!data) return;
    try {
      setError("");
      const next = await adminApi.updateLlmFacilities({
        features: buildFeatureUpdates(data.features, formData),
      });
      mutate(next, false);
      toast.success("LLM 设施配置已保存");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存 LLM 设施配置失败");
    }
  }

  return (
    <AdminShell title="LLM 设施面板" description="为站内各类 LLM 功能绑定已导入的模型。">
      {loadError ? <div className="col-span-12"><ErrorBox message={loadError instanceof Error ? loadError.message : "读取 LLM 设施失败"} /></div> : null}
      {data ? <FacilitiesPanel error={error} features={data.features} models={data.models} onSave={handleSave} /> : null}
    </AdminShell>
  );
}

function FacilitiesPanel(props: Readonly<{
  error: string;
  features: readonly AdminLlmFeatureSetting[];
  models: readonly AdminLlmFeatureModel[];
  onSave: (formData: FormData) => Promise<void>;
}>) {
  const hasMissingOptions = props.features.some((feature) => allowedModels(props.models, feature).length === 0);
  return (
    <div className="col-span-12">
      <Panel title="功能模型映射" description="模型来源于 Provider 页已导入或手工创建的模型。">
        <form className="grid gap-3" action={props.onSave}>
          <div className="grid gap-2">
            {props.features.map((feature) => (
              <FeatureModelRow key={feature.feature_key} feature={feature} models={props.models} />
            ))}
          </div>
          <SubmitButton disabled={hasMissingOptions} pendingText="保存中...">保存设施配置</SubmitButton>
        </form>
        {props.error ? <div className="mt-3"><ErrorBox message={props.error} /></div> : null}
      </Panel>
    </div>
  );
}

function FeatureModelRow(props: Readonly<{
  feature: AdminLlmFeatureSetting;
  models: readonly AdminLlmFeatureModel[];
}>) {
  const models = allowedModels(props.models, props.feature);
  const selectedModel = findSelectedModel(props.models, props.feature.model_code);
  const currentCode = props.feature.model_code ?? props.feature.default_model_code;
  return (
    <section className="grid gap-3 rounded-lg border border-gray-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{props.feature.display_name}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {INPUT_MODE_LABELS[props.feature.input_mode]}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-500">{props.feature.description}</p>
        <p className="mt-1 truncate text-xs text-gray-400">
          当前上游：{selectedModel?.provider_model ?? currentCode}
        </p>
      </div>
      <FeatureModelSelect currentCode={currentCode} feature={props.feature} models={models} />
    </section>
  );
}

function FeatureModelSelect(props: Readonly<{
  currentCode: string;
  feature: AdminLlmFeatureSetting;
  models: readonly AdminLlmFeatureModel[];
}>) {
  if (props.models.length === 0) {
    return <select className="admin-input" disabled><option>无可用模型</option></select>;
  }
  return (
    <select className="admin-input" name={props.feature.feature_key} defaultValue={props.currentCode} required>
      {includeMissingCurrentModel(props.models, props.currentCode).map((model) => (
        <option key={model.code} value={model.code}>
          {model.display_name} · {model.code}
        </option>
      ))}
    </select>
  );
}

function allowedModels(
  models: readonly AdminLlmFeatureModel[],
  feature: AdminLlmFeatureSetting,
): readonly AdminLlmFeatureModel[] {
  return models.filter((model) => feature.required_capabilities.includes(model.capability));
}

function findSelectedModel(models: readonly AdminLlmFeatureModel[], modelCode: string | null): AdminLlmFeatureModel | null {
  return models.find((model) => model.code === modelCode) ?? null;
}

function includeMissingCurrentModel(
  models: readonly AdminLlmFeatureModel[],
  currentCode: string,
): readonly AdminLlmFeatureModel[] {
  if (!currentCode || models.some((model) => model.code === currentCode)) {
    return models;
  }
  return [
    {
      anonymous_price_cents: 0,
      capability: "text",
      code: currentCode,
      display_name: `${currentCode}（当前不可用）`,
      id: -1,
      member_price_cents: 0,
      provider_id: -1,
      provider_model: currentCode,
      public_enabled: false,
    },
    ...models,
  ];
}

function buildFeatureUpdates(features: readonly AdminLlmFeatureSetting[], formData: FormData) {
  return features.map((feature) => ({
    feature_key: feature.feature_key,
    model_code: String(formData.get(feature.feature_key) ?? feature.model_code ?? feature.default_model_code),
  }));
}
