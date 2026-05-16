import type { LlmPurposeModelSetting, SellableModel } from "@/lib/use-admin-data";

type LlmPurposeModelFieldsProps = Readonly<{
  models: readonly SellableModel[];
  purposes: readonly LlmPurposeModelSetting[];
}>;

export function LlmPurposeModelFields({ models, purposes }: LlmPurposeModelFieldsProps) {
  const chatModels = models.filter((model) => model.capability === "chat" || model.capability === "text");
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-gray-700">LLM 功能模型</legend>
      <div className="grid gap-3">
        {purposes.map((purpose) => (
          <LlmPurposeModelSelect
            key={purpose.purpose}
            models={chatModels}
            purpose={purpose}
          />
        ))}
      </div>
    </fieldset>
  );
}

function LlmPurposeModelSelect(props: Readonly<{
  models: readonly SellableModel[];
  purpose: LlmPurposeModelSetting;
}>) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
      {props.purpose.label}
      <select
        className="admin-input"
        name={`llm_purpose_model:${props.purpose.purpose}`}
        defaultValue={props.purpose.model_code}
      >
        <option value="">默认模型：{props.purpose.default_model_code}</option>
        {props.models.map((model) => (
          <option key={model.code} value={model.code}>
            {model.display_name} ({model.code})
          </option>
        ))}
      </select>
      <span className="admin-hint">{props.purpose.description}</span>
    </label>
  );
}
