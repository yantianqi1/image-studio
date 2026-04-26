import { useEffect, useState } from "react";

import { publicApi, type ComicProject, type ComicTaskImageResult, type TaskItem } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

import type { CharacterReferenceMode } from "./character-reference-modes";
import type { ComicStylePresetId } from "./comic-style-presets";
import type { ComicWorkspaceStatus } from "./comic-state";
import { buildStoryboardShots } from "./comic-utils";
import { buildWorkflowEvent, type ComicWorkflowEvent, type ComicWorkflowEventKey } from "./comic-workflow-events";

const FAILED_TASK_STATUS = "failed";
const POLL_INTERVAL_MS = 1000;
const TASK_STAGE_EVENT_KEYS: Readonly<Record<string, ComicWorkflowEventKey>> = {
  processing: "task_started",
  analyzing: "story_analyzing",
  characterizing: "character_designing",
  storyboarding: "storyboarding",
  prompting: "prompt_composing",
};
const TASK_STAGE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  processing: "后端 worker 已领取任务",
  analyzing: "LLM 正在分析剧情",
  characterizing: "LLM 正在生成人物设定",
  storyboarding: "LLM 正在生成分镜",
  prompting: "系统正在生成图片提示词",
};
const AUTO_REFRESH_STATUSES = new Set([
  "task_queued",
  "task_started",
  "story_analyzing",
  "character_designing",
  "storyboarding",
  "prompt_composing",
  "llm_processing",
  "character_reference_pending",
  "character_reference_generating",
  "character_reference_ready",
  "page_image_generating",
]);

export const TASK_TYPE_SCENE_RENDER = "scene-render";

export function buildTaskInputPayload(
  premise: string,
  stylePresetId: ComicStylePresetId,
  characterReferenceMode: CharacterReferenceMode,
): Record<string, unknown> {
  return {
    source_type: "text",
    source_text: premise,
    style_preset: stylePresetId,
    character_reference_mode: characterReferenceMode,
    panels_per_image: 3,
  };
}

export function buildShots(
  tasksState: ResourceState<readonly TaskItem[]>,
  imageResultsState: ResourceState<readonly ComicTaskImageResult[]>,
) {
  if (tasksState.status !== "ready") {
    return [];
  }
  const imageResults = imageResultsState.status === "ready" ? imageResultsState.data : [];
  return buildStoryboardShots(tasksState.data, imageResults);
}

export function selectLatestTask(tasksState: ResourceState<readonly TaskItem[]>): TaskItem | null {
  if (tasksState.status !== "ready") {
    return null;
  }
  return tasksState.data[0] ?? null;
}

export function useComicTaskImageResults(taskId: string | number | null, refreshKey: number): ResourceState<readonly ComicTaskImageResult[]> {
  const [state, setState] = useState<ResourceState<readonly ComicTaskImageResult[]>>({ status: "loading" });

  useEffect(() => {
    if (taskId === null) {
      setState({ status: "ready", data: [] });
      return;
    }
    let active = true;
    publicApi.getComicTaskImageResults(String(taskId))
      .then((data) => active ? setState({ status: "ready", data }) : undefined)
      .catch((error: unknown) => active ? setState({ status: "error", message: error instanceof Error ? error.message : "漫画图片结果读取失败" }) : undefined);
    return () => {
      active = false;
    };
  }, [taskId, refreshKey]);

  return state;
}

export async function waitForComicTask(taskId: string, onTaskUpdate: (task: TaskItem) => void): Promise<void> {
  let lastState = "";
  for (;;) {
    const task = await publicApi.getComicTask(taskId);
    const state = `${task.status}:${task.stage ?? ""}:${task.progress_percent ?? ""}`;
    if (state !== lastState) {
      onTaskUpdate(task);
      lastState = state;
    }
    if (task.status === "failed") throw new Error(task.error_message ?? "漫画任务失败");
    if (task.status === "completed") return;
    await sleep(POLL_INTERVAL_MS);
  }
}

export function taskStageEventKey(task: TaskItem): ComicWorkflowEventKey | null {
  if (task.status === "completed") return "llm_completed";
  return TASK_STAGE_EVENT_KEYS[task.stage ?? ""] ?? null;
}

export function taskStageEventDescription(task: TaskItem): string | undefined {
  if (task.status === "completed") {
    return "后端已完成剧情分析、人物设定、分镜和页面提示词。";
  }
  if (typeof task.progress_percent !== "number") {
    return undefined;
  }
  const description = TASK_STAGE_DESCRIPTIONS[task.stage ?? ""] ?? "后端任务正在运行";
  return `${description}，当前进度 ${task.progress_percent}%。`;
}

export async function waitForCharacterReferences(taskId: string): Promise<void> {
  for (;;) {
    const characters = await publicApi.getComicCharacterReferences(taskId);
    const failed = characters.find((character) => character.image_status === "failed");
    if (failed) throw new Error(failed.error_message ?? "角色参考图生成失败");
    if (characters.length > 0 && characters.every((character) => character.reference_asset_id !== null)) return;
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function waitForPageImages(taskId: string): Promise<void> {
  for (;;) {
    const results = await publicApi.getComicTaskImageResults(taskId);
    const failed = results.find((item) => item.image_status === "failed");
    if (failed) throw new Error(failed.error_message ?? "漫画页面生成失败");
    if (results.length > 0 && results.every((item) => item.image_status === "succeeded" && item.result)) return;
    await sleep(POLL_INTERVAL_MS);
  }
}

export function getPreviewError(
  projectsState: ResourceState<readonly ComicProject[]>,
  tasksState: ResourceState<readonly TaskItem[]>,
  imageResultsState: ResourceState<readonly ComicTaskImageResult[]>,
): string | undefined {
  if (tasksState.status === "error") return tasksState.message;
  if (projectsState.status === "error") return projectsState.message;
  if (imageResultsState.status === "error") return imageResultsState.message;
  if (tasksState.status !== "ready") return undefined;
  const task = tasksState.data[0];
  if (task?.status === FAILED_TASK_STATUS) return task.error_message ?? undefined;
  if (imageResultsState.status !== "ready") return undefined;
  return imageResultsState.data.find((item) => item.image_status === FAILED_TASK_STATUS)?.error_message ?? undefined;
}

export function derivePersistentWorkspaceStatus(
  baseStatus: ComicWorkspaceStatus,
  latestTask: TaskItem | null,
  imageResultsState: ResourceState<readonly ComicTaskImageResult[]>,
): ComicWorkspaceStatus {
  if (latestTask?.status !== "completed") {
    return baseStatus;
  }
  if (imageResultsState.status !== "ready") {
    return "page_image_generating";
  }
  const results = imageResultsState.data;
  if (results.some((item) => item.image_status === "failed")) {
    return "failed";
  }
  if (results.length > 0 && results.every((item) => item.image_status === "succeeded" && item.result)) {
    return "completed";
  }
  return "page_image_generating";
}

export function shouldAutoRefreshComic(status: string): boolean {
  return AUTO_REFRESH_STATUSES.has(status);
}

export function buildPersistedWorkflowEvents(
  latestTask: TaskItem | null,
  imageResultsState: ResourceState<readonly ComicTaskImageResult[]>,
): readonly ComicWorkflowEvent[] {
  if (latestTask === null) {
    return [];
  }
  const events = buildTaskWorkflowEvents(latestTask);
  if (latestTask.status === "completed") {
    events.push(...buildImageWorkflowEvents(imageResultsState));
  }
  return events.map((event, index) => buildWorkflowEvent(event.key, index + 1, event.description));
}

function buildTaskWorkflowEvents(task: TaskItem): Array<{ key: ComicWorkflowEventKey; description?: string }> {
  if (task.status === "pending" || task.status === "queued") {
    return [{ key: "task_queued", description: "任务记录已持久化，后端 worker 会自动接手。" }];
  }
  const key = taskStageEventKey(task);
  if (key) {
    return [{ key, description: taskStageEventDescription(task) }];
  }
  return [];
}

function buildImageWorkflowEvents(
  imageResultsState: ResourceState<readonly ComicTaskImageResult[]>,
): Array<{ key: ComicWorkflowEventKey; description?: string }> {
  if (imageResultsState.status !== "ready") {
    return [{ key: "page_generating", description: "正在读取持久化图片任务结果。" }];
  }
  return buildReadyImageWorkflowEvents(imageResultsState.data);
}

function buildReadyImageWorkflowEvents(
  results: readonly ComicTaskImageResult[],
): Array<{ key: ComicWorkflowEventKey; description?: string }> {
  if (results.length > 0 && results.every((item) => item.image_status === "succeeded" && item.result)) {
    return [{ key: "completed", description: `已从后端恢复 ${results.length} 张漫画页面。` }];
  }
  const createdCount = results.filter((item) => item.image_job_id !== null).length;
  return [{ key: "page_generating", description: `后端正在持久化生成漫画页面，已创建 ${createdCount}/${results.length} 个图片任务。` }];
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
