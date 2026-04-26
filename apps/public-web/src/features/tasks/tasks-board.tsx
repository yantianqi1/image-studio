"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";

import { AppShell } from "@/features/shell/app-shell";
import { ErrorMessage } from "@/features/ui/error-message";
import { SectionPanel } from "@/features/ui/section-panel";
import { StatusCard } from "@/features/ui/status-card";
import { formatDateTime } from "@/lib/formatters";
import { publicApi, type ImageGenerationResponse, type ImageJobResult } from "@/lib/public-api";
import { useApiResource } from "@/lib/use-api-resource";

const DELETE_SKIP_KEY = "commercial-studio:tasks-delete-skip-date";

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function canSkipDeleteConfirm() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(DELETE_SKIP_KEY) === getTodayKey();
}

function rememberDeleteConfirmSkip(enabled: boolean) {
  if (!enabled) {
    return;
  }
  window.localStorage.setItem(DELETE_SKIP_KEY, getTodayKey());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知请求错误";
}

export function TasksBoard() {
  const board = useTasksBoardState();

  return (
    <AppShell title="我的任务">
      <SectionPanel title="任务列表">
        <TaskListState state={board.tasksState} />
        {board.operationError ? <ErrorMessage message={board.operationError} title="任务操作失败" /> : null}
        {board.tasksState.status === "ready" && board.tasksState.data.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {board.tasksState.data.map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                onDelete={() => board.requestDelete(item)}
                onPreview={() => board.setSelectedTask(item)}
              />
            ))}
          </div>
        ) : null}
      </SectionPanel>
      {board.selectedTask ? <TaskPreviewDialog task={board.selectedTask} onClose={() => board.setSelectedTask(null)} /> : null}
      {board.deleteTarget ? <DeleteTaskDialog task={board.deleteTarget} onCancel={board.cancelDelete} onConfirm={board.confirmDelete} /> : null}
    </AppShell>
  );
}

function useTasksBoardState() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTask, setSelectedTask] = useState<ImageGenerationResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageGenerationResponse | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const tasksState = useApiResource(() => publicApi.getTasks(), refreshKey);
  const actions = useTaskDeleteActions({ selectedTask, setOperationError, setRefreshKey, setSelectedTask });

  async function requestDelete(task: ImageGenerationResponse) {
    if (!canSkipDeleteConfirm()) {
      setDeleteTarget(task);
      return;
    }
    try {
      await actions.deleteTask(task);
    } catch (error) {
      setOperationError(getErrorMessage(error));
    }
  }

  async function confirmDelete(skipToday: boolean) {
    if (deleteTarget === null) {
      return;
    }
    await actions.deleteTask(deleteTarget);
    rememberDeleteConfirmSkip(skipToday);
    setDeleteTarget(null);
  }

  return {
    cancelDelete: () => setDeleteTarget(null),
    confirmDelete,
    deleteTarget,
    operationError,
    requestDelete,
    selectedTask,
    setSelectedTask,
    tasksState,
  };
}

type DeleteActionsOptions = Readonly<{
  selectedTask: ImageGenerationResponse | null;
  setOperationError: (message: string | null) => void;
  setRefreshKey: (updater: (value: number) => number) => void;
  setSelectedTask: (task: ImageGenerationResponse | null) => void;
}>;

function useTaskDeleteActions(options: DeleteActionsOptions) {
  async function deleteTask(task: ImageGenerationResponse) {
    options.setOperationError(null);
    await publicApi.deleteImageJob(task.id);
    if (options.selectedTask?.id === task.id) {
      options.setSelectedTask(null);
    }
    options.setRefreshKey((value) => value + 1);
  }

  return { deleteTask };
}

type TaskListStateProps = Readonly<{
  state: ReturnType<typeof useApiResource<readonly ImageGenerationResponse[]>>;
}>;

function TaskListState({ state }: TaskListStateProps) {
  if (state.status === "loading") {
    return <StatusCard title="加载中" description="正在读取任务列表..." tone="loading" />;
  }
  if (state.status === "error") {
    return <ErrorMessage message={state.message} title="任务读取失败" />;
  }
  if (state.data.length === 0) {
    return <StatusCard title="暂无任务" description="还没有创建过任务" tone="empty" />;
  }
  return null;
}

type TaskCardProps = Readonly<{
  item: ImageGenerationResponse;
  onDelete: () => void;
  onPreview: () => void;
}>;

function TaskCard({ item, onDelete, onPreview }: TaskCardProps) {
  return (
    <article className="list-card flex min-h-36 flex-col justify-between gap-4">
      <button className="text-left" type="button" onClick={onPreview}>
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 flex-1 text-sm font-medium">{item.prompt}</p>
          <TaskStatusPill status={item.status} />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {item.model_code} · {formatDateTime(item.created_at ?? "")}
        </p>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <button className="text-xs font-semibold text-gray-600 hover:text-gray-950" type="button" onClick={onPreview}>
          查看结果
        </button>
        <button className="text-xs font-semibold text-red-500 hover:text-red-700" type="button" onClick={onDelete}>
          删除
        </button>
      </div>
    </article>
  );
}

function TaskStatusPill({ status }: Readonly<{ status: string }>) {
  const tone = status === "succeeded"
    ? "bg-emerald-50 text-emerald-700"
    : status === "failed"
      ? "bg-red-50 text-red-700"
      : status === "running" || status === "processing"
        ? "bg-blue-50 text-blue-700"
        : "bg-gray-100 text-gray-600";
  return <span className={`pill shrink-0 ${tone}`}>{status}</span>;
}

type TaskPreviewDialogProps = Readonly<{
  task: ImageGenerationResponse;
  onClose: () => void;
}>;

function TaskPreviewDialog({ task, onClose }: TaskPreviewDialogProps) {
  const resultsState = useApiResource(() => publicApi.getImageJobResults(task.id), task.id);
  return (
    <TaskDialog title="任务结果预览" onClose={onClose}>
      <p className="text-sm font-medium text-gray-900">{task.prompt}</p>
      <p className="mt-1 text-xs text-gray-500">{task.model_code} · {task.status}</p>
      <PreviewContent state={resultsState} />
    </TaskDialog>
  );
}

type PreviewContentProps = Readonly<{
  state: ReturnType<typeof useApiResource<readonly ImageJobResult[]>>;
}>;

function PreviewContent({ state }: PreviewContentProps) {
  if (state.status === "loading") {
    return <StatusCard title="读取结果中" description="正在加载预览图..." tone="loading" />;
  }
  if (state.status === "error") {
    return <ErrorMessage message={state.message} title="结果读取失败" />;
  }
  if (state.data.length === 0) {
    return <StatusCard title="暂无预览图" description="任务还没有生成可预览结果" tone="empty" />;
  }
  return <ResultGrid results={state.data} />;
}

function ResultGrid({ results }: Readonly<{ results: readonly ImageJobResult[] }>) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {results.map((result) => (
        <a key={result.id} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white" href={result.asset_url} target="_blank">
          <Image
            className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            src={result.asset_url}
            alt={`任务结果 ${result.result_index}`}
            width={960}
            height={960}
            unoptimized
          />
        </a>
      ))}
    </div>
  );
}

type DeleteTaskDialogProps = Readonly<{
  task: ImageGenerationResponse;
  onCancel: () => void;
  onConfirm: (skipToday: boolean) => Promise<void>;
}>;

function DeleteTaskDialog({ task, onCancel, onConfirm }: DeleteTaskDialogProps) {
  const [skipToday, setSkipToday] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(skipToday);
    } catch (confirmError) {
      setError(getErrorMessage(confirmError));
      setIsDeleting(false);
    }
  }

  return (
    <TaskDialog title="删除任务" onClose={isDeleting ? undefined : onCancel}>
      <p className="text-sm text-gray-700">确定删除这个任务吗？任务记录和已生成的结果图会一并移除。</p>
      <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm font-medium text-gray-900 line-clamp-3">{task.prompt}</p>
      <label className="mt-4 flex items-center gap-2 text-sm text-gray-600">
        <input className="h-4 w-4 rounded border-gray-300" type="checkbox" checked={skipToday} onChange={(event) => setSkipToday(event.target.checked)} />
        今天再次删除无需二次确认
      </label>
      {error ? <ErrorMessage message={error} title="删除失败" /> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700" type="button" onClick={onCancel} disabled={isDeleting}>
          取消
        </button>
        <button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="button" onClick={confirmDelete} disabled={isDeleting}>
          {isDeleting ? "删除中..." : "确认删除"}
        </button>
      </div>
    </TaskDialog>
  );
}

type TaskDialogProps = Readonly<{
  title: string;
  children: ReactNode;
  onClose?: () => void;
}>;

function TaskDialog({ title, children, onClose }: TaskDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/70 bg-white/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
          {onClose ? <button className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-200" type="button" onClick={onClose}>关闭</button> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
