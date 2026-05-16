import type { ImageGenerationResponse, LoginResponse, PublicQuotaStatus } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

import { MONTH_KEY_LENGTH, UNAUTHORIZED_STATUS } from "./account-types";

export function isUnauthorizedState(state: ResourceState<unknown>) {
  return state.status === "error" && state.statusCode === UNAUTHORIZED_STATUS;
}

export function getDisplayName(user: LoginResponse) {
  return user.display_name || user.email || "星河漫游者";
}

export function getUserInitial(user: LoginResponse) {
  return getDisplayName(user).slice(0, 1).toUpperCase();
}

export function getAccountId(user: LoginResponse) {
  return `ISU-${String(user.id).padStart(8, "0")}`;
}

export function getQuotaValueLabel(state?: ResourceState<PublicQuotaStatus>) {
  if (state?.status !== "ready") {
    return "读取中";
  }
  return `${state.data.remaining_count} / ${state.data.limit_count} 可用`;
}

export function getAvailableQuotaLabel(state: ResourceState<PublicQuotaStatus>) {
  if (state.status !== "ready") {
    return "读取中";
  }
  return `${state.data.remaining_count} / ${state.data.limit_count}`;
}

export function countCurrentMonthTasks(tasks: readonly ImageGenerationResponse[]) {
  const monthKey = new Date().toISOString().slice(0, MONTH_KEY_LENGTH);
  return tasks.filter((task) => task.created_at?.startsWith(monthKey)).length;
}

export function getTaskStatusLabel(status: string) {
  return status === "succeeded" ? "已完成" : status;
}
