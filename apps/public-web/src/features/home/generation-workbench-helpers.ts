import type { GenerationHistoryItem } from "@/features/home/generation-history.types";
import { filterImageModels } from "@/features/home/generation-models";
import {
  DEFAULT_ASPECT_RATIO,
  MIN_REQUESTED_COUNT,
  type GenerationSourceImage,
  type GenerationState,
  type ImageFormState,
} from "@/features/home/generation-workbench.types";
import { formatCurrency } from "@/lib/formatters";
import type { PublicModelSummary, WalletSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

const CURRENCY_CODE = "CNY";
const UNAUTHORIZED_STATUS = 401;
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "commercial_studio_history_sidebar_collapsed";

export const INITIAL_FORM: ImageFormState = {
  model_code: "",
  prompt: "",
  requested_count: MIN_REQUESTED_COUNT,
  aspect_ratio: DEFAULT_ASPECT_RATIO,
  visibility: "private",
};

export type SubmissionModelResult =
  | Readonly<{ model: PublicModelSummary }>
  | Readonly<{ error: string }>;

export function readSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

export function saveSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
}

export function getWorkspaceClass(styles: Record<string, string>, collapsed: boolean) {
  return collapsed
    ? `${styles.workspace} ${styles.workspaceCollapsed}`
    : styles.workspace;
}

export function getImageModelsState(
  modelsState: ResourceState<readonly PublicModelSummary[]>,
): ResourceState<readonly PublicModelSummary[]> {
  if (modelsState.status !== "ready") {
    return modelsState;
  }

  return { status: "ready", data: filterImageModels(modelsState.data) };
}

export function resolveSubmissionModel({
  imageModelsState,
  selectedModel,
}: Readonly<{
  imageModelsState: ReturnType<typeof getImageModelsState>;
  selectedModel: PublicModelSummary | null;
}>): SubmissionModelResult {
  if (imageModelsState.status !== "ready") {
    return { error: "模型列表尚未就绪，暂时无法提交生成任务。" } as const;
  }
  if (imageModelsState.data.length === 0) {
    return { error: "当前没有可用模型，无法创建生成任务。" } as const;
  }
  if (!selectedModel) {
    return { error: "所选模型不存在，请重新选择后再提交。" } as const;
  }
  return { model: selectedModel } as const;
}

export function getWalletLabel(walletState: ResourceState<WalletSummary>) {
  if (walletState.status === "error" && walletState.statusCode === UNAUTHORIZED_STATUS) {
    return "未登录";
  }
  if (walletState.status !== "ready") {
    return "余额 --";
  }

  return formatCurrency(walletState.data.balance_cents / 100, walletState.data.currency || CURRENCY_CODE);
}

export function getStateFromHistory(history: GenerationHistoryItem | null): GenerationState {
  if (!history) {
    return { status: "idle" };
  }

  if (history.status === "failed") {
    return { status: "error", message: history.errorMessage ?? "生成任务失败" };
  }

  if (history.status === "pending" || history.status === "generating") {
    return { status: "submitting" };
  }

  if (history.status === "success") {
    return {
      status: "success",
      jobId: history.taskId ?? 0,
      taskStatus: history.taskStatus ?? "success",
    };
  }

  return { status: "idle" };
}

export function getFormFromHistory(history: GenerationHistoryItem | null): ImageFormState {
  if (!history) {
    return INITIAL_FORM;
  }

  return {
    model_code: history.modelCode,
    prompt: history.prompt,
    requested_count: history.count,
    aspect_ratio: history.aspectRatio,
    visibility: history.visibility ?? "private",
  };
}

export function getReferenceImagesFromHistory(
  history: GenerationHistoryItem | null,
): readonly GenerationSourceImage[] {
  if (!history) {
    return [];
  }
  if (history.referenceImages !== undefined) {
    return history.referenceImages;
  }
  return history.sourceImage ? [history.sourceImage] : [];
}
