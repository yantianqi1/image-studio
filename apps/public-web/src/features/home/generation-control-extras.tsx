import type { GenerationState } from "@/features/home/generation-workbench.types";
import { ErrorMessage } from "@/features/ui/error-message";
import { StatusCard } from "@/features/ui/status-card";
import type { PublicModelSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

export function RequestStatus({
  modelsState,
  state,
}: Readonly<{
  modelsState: ResourceState<readonly PublicModelSummary[]>;
  state: GenerationState;
}>) {
  return (
    <div className="grid gap-2">
      {modelsState.status === "loading" ? <StatusCard title="模型列表加载中" description="正在获取可用模型列表..." tone="loading" /> : null}
      {modelsState.status === "error" ? <ErrorMessage message={modelsState.message} title="模型列表读取失败" /> : null}
      {modelsState.status === "ready" && modelsState.data.length === 0 ? <StatusCard title="暂无模型" description="当前没有公开可用的生图模型。" tone="empty" /> : null}
      {state.status === "error" ? <ErrorMessage message={state.message} /> : null}
    </div>
  );
}
