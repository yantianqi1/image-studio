"use client";

import { ErrorMessage } from "@/features/ui/error-message";
import { SectionPanel } from "@/features/ui/section-panel";
import { StatusCard } from "@/features/ui/status-card";
import { formatCredits, formatDateTime } from "@/lib/formatters";
import { publicApi } from "@/lib/public-api";
import type { ImageGenerationResponse, LoginResponse } from "@/lib/public-api";
import { type ResourceState, useApiResource } from "@/lib/use-api-resource";

const UNAUTHORIZED_STATUS = 401;

export function useWalletTaskHistory(
  userState: ResourceState<LoginResponse>,
  refreshKey: number,
): ResourceState<readonly ImageGenerationResponse[]> {
  const taskRefreshKey = userState.status === "ready" ? refreshKey : -1;
  const rawTasksState = useApiResource(() => loadAuthenticatedTasks(userState), taskRefreshKey);
  return resolveAuthenticatedTasksState(userState, rawTasksState);
}

function loadAuthenticatedTasks(
  userState: ResourceState<LoginResponse>,
): Promise<readonly ImageGenerationResponse[]> {
  if (userState.status !== "ready") {
    return Promise.resolve([]);
  }
  return publicApi.getTasks();
}

function resolveAuthenticatedTasksState(
  userState: ResourceState<LoginResponse>,
  tasksState: ResourceState<readonly ImageGenerationResponse[]>,
): ResourceState<readonly ImageGenerationResponse[]> {
  if (userState.status === "ready") {
    return tasksState;
  }
  if (userState.status === "loading") {
    return { status: "loading" };
  }
  return { status: "error", message: userState.message, statusCode: userState.statusCode };
}

export function TaskHistorySection(props: Readonly<{
  tasksState: ResourceState<readonly ImageGenerationResponse[]>;
}>) {
  return (
    <SectionPanel title="任务记录">
      {props.tasksState.status === "loading" ? (
        <StatusCard title="任务加载中" description="正在读取生成任务..." tone="loading" />
      ) : null}
      {isUnauthorizedState(props.tasksState) ? (
        <StatusCard title="未登录" description="登录后可以查看任务扣费记录。" tone="neutral" />
      ) : null}
      {props.tasksState.status === "error" && !isUnauthorizedState(props.tasksState) ? (
        <ErrorMessage message={props.tasksState.message} title="任务读取失败" />
      ) : null}
      {props.tasksState.status === "ready" ? <TaskHistoryReady items={props.tasksState.data} /> : null}
    </SectionPanel>
  );
}

function isUnauthorizedState(state: ResourceState<unknown>) {
  return state.status === "error" && state.statusCode === UNAUTHORIZED_STATUS;
}

function TaskHistoryReady({ items }: Readonly<{ items: readonly ImageGenerationResponse[] }>) {
  if (items.length === 0) {
    return <StatusCard title="暂无任务" description="还没有创建过生成任务" tone="empty" />;
  }
  return <div className="grid gap-2">{items.map((item) => <TaskHistoryRow key={item.id} item={item} />)}</div>;
}

function TaskHistoryRow({ item }: Readonly<{ item: ImageGenerationResponse }>) {
  return (
    <div className="list-card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{item.title || item.prompt}</p>
          <TaskStatusPill status={item.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-400">
          {item.model_code} · {formatDateTime(item.created_at ?? "")}
        </p>
      </div>
      <p className="shrink-0 text-sm font-bold text-red-600">-{formatCredits(item.charge_credits)}</p>
    </div>
  );
}

function TaskStatusPill({ status }: Readonly<{ status: string }>) {
  return <span className={`pill shrink-0 ${taskStatusTone(status)}`}>{status}</span>;
}

function taskStatusTone(status: string) {
  if (status === "succeeded") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") {
    return "bg-red-50 text-red-700";
  }
  if (status === "running" || status === "processing") {
    return "bg-blue-50 text-blue-700";
  }
  return "bg-gray-100 text-gray-600";
}
