import type { ComicProject, TaskItem } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

type CreateStatus = "idle" | "submitting" | "error" | "success";
export type ComicWorkspaceStatus =
  | "empty"
  | "submitting"
  | "project_created_no_task"
  | "task_queued"
  | "task_started"
  | "story_analyzing"
  | "character_designing"
  | "storyboarding"
  | "prompt_composing"
  | "llm_processing"
  | "character_reference_pending"
  | "character_reference_generating"
  | "character_reference_ready"
  | "page_image_generating"
  | "completed"
  | "failed";

const FAILED_TASK_STATUS = "failed";
const COMPLETED_TASK_STATUS = "completed";
const TASK_STAGE_WORKSPACE_STATUS: Readonly<Record<string, ComicWorkspaceStatus>> = {
  processing: "task_started",
  analyzing: "story_analyzing",
  characterizing: "character_designing",
  storyboarding: "storyboarding",
  prompting: "prompt_composing",
};

export function deriveComicWorkspaceStatus(
  projectsState: ResourceState<readonly ComicProject[]>,
  tasksState: ResourceState<readonly TaskItem[]>,
  createStatus: CreateStatus,
): ComicWorkspaceStatus {
  if (createStatus === "submitting") return "submitting";
  if (projectsState.status === "error" || tasksState.status === "error") return FAILED_TASK_STATUS;
  if (tasksState.status === "loading" || projectsState.status === "loading") return "task_queued";
  if (projectsState.status !== "ready" || projectsState.data.length === 0) return "empty";
  if (tasksState.status !== "ready" || tasksState.data.length === 0) return "project_created_no_task";

  const task = latestTask(tasksState.data);
  if (!task) return "project_created_no_task";
  return deriveComicWorkspaceStatusFromTask(task);
}

function latestTask(tasks: readonly TaskItem[]): TaskItem | null {
  return tasks[0] ?? null;
}

export function deriveComicWorkspaceStatusFromTask(task: TaskItem): ComicWorkspaceStatus {
  if (task.status === FAILED_TASK_STATUS) return FAILED_TASK_STATUS;
  if (task.status === COMPLETED_TASK_STATUS) return COMPLETED_TASK_STATUS;
  const stagedStatus = TASK_STAGE_WORKSPACE_STATUS[task.stage ?? ""];
  if (stagedStatus) return stagedStatus;
  if (["pending", "queued"].includes(task.status)) return "task_queued";
  if (task.status === "running") return "llm_processing";
  return "project_created_no_task";
}
