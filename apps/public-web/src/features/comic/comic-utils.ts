import type { ComicProject, ComicTaskImageResult, TaskItem } from "@/lib/public-api";

export type StoryboardShot = Readonly<{
  id: string;
  index: number;
  title: string;
  description: string;
  shotType: string;
  scene: string;
  duration: string;
  status: string;
  assetUrl?: string | null;
  imageJobId?: number | null;
  promptText?: string | null;
  errorMessage?: string | null;
}>;

const MAX_PROJECT_TITLE = 50;

export const PROJECT_TITLE_LIMIT = MAX_PROJECT_TITLE;

export function getInitials(title: string): string {
  const trimmedTitle = title.trim();
  return trimmedTitle.slice(0, 2).toUpperCase() || "CS";
}

export function formatRelativeTime(value?: string): string {
  if (!value) {
    return "刚刚";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const delta = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) {
    return "刚刚";
  }
  if (delta < hour) {
    return `${Math.floor(delta / minute)} 分钟前`;
  }
  if (delta < day) {
    return `${Math.floor(delta / hour)} 小时前`;
  }
  if (delta < 2 * day) {
    return "昨天";
  }
  return date.toISOString().slice(0, 10);
}

export function buildStoryboardShots(
  tasks: readonly TaskItem[],
  imageResults: readonly ComicTaskImageResult[] = [],
): readonly StoryboardShot[] {
  const task = tasks.find((item) => item.status === "completed") ?? tasks[0];
  if (!task || task.status !== "completed") {
    return [];
  }
  const storyboardItems = extractStoryboardItems(task);
  if (storyboardItems.length > 0) {
    return storyboardItems.map((item, index) => buildStoryboardShot(task, item, index, imageResults[index]));
  }
  return buildFallbackShots(task, imageResults);
}

function buildStoryboardShot(
  task: TaskItem,
  item: StoryboardPayloadItem,
  index: number,
  result?: ComicTaskImageResult,
): StoryboardShot {
  return {
    id: `${task.id}-${item.id ?? index + 1}`,
    index: index + 1,
    title: item.title,
    description: item.description,
    shotType: item.shotType,
    scene: item.scene,
    duration: item.duration,
    status: result?.image_status ?? task.status,
    assetUrl: result?.result?.asset_url ?? null,
    imageJobId: result?.image_job_id ?? null,
    promptText: result?.prompt ?? null,
    errorMessage: result?.error_message ?? null,
  };
}

function buildFallbackShots(
  task: TaskItem,
  imageResults: readonly ComicTaskImageResult[],
): readonly StoryboardShot[] {
  const count = Math.max(imageResults.length, readPromptCount(task));
  return Array.from({ length: count }, (_, index) => {
    const result = imageResults[index];
    return {
      id: `${task.id}-page-${index + 1}`,
      index: index + 1,
      title: `漫画页面 ${index + 1}`,
      description: result?.result ? "真实页面图片已生成，可直接预览。" : "分镜已完成，等待页面图片结果。",
      shotType: `第 ${index + 1} 页`,
      scene: String(task.task_type ?? task.type ?? "scene-render"),
      duration: `Job ${result?.image_job_id ?? "待创建"}`,
      status: result?.image_status ?? task.status,
      assetUrl: result?.result?.asset_url ?? null,
      imageJobId: result?.image_job_id ?? null,
      promptText: result?.prompt ?? null,
      errorMessage: result?.error_message ?? null,
    };
  });
}

function readPromptCount(task: TaskItem): number {
  const payload = task.output_payload;
  if (!isRecord(payload) || typeof payload.prompt_count !== "number") {
    return 0;
  }
  return Math.max(0, payload.prompt_count);
}

export function latestProject(projects: readonly ComicProject[]): ComicProject | null {
  return projects[0] ?? null;
}

function extractStoryboardItems(task: TaskItem): readonly StoryboardPayloadItem[] {
  const payload = task.output_payload;
  if (!isRecord(payload)) {
    return [];
  }
  const candidates = [payload.storyboard, payload.panels, payload.pages, payload.frames];
  const storyboard = candidates.find(Array.isArray);
  if (!Array.isArray(storyboard)) {
    return [];
  }
  return storyboard.flatMap((item) => (isStoryboardItem(item) ? [item] : []));
}

type StoryboardPayloadItem = Readonly<{
  id?: string | number;
  title: string;
  description: string;
  shotType: string;
  scene: string;
  duration: string;
}>;

function isStoryboardItem(value: unknown): value is StoryboardPayloadItem {
  if (!isRecord(value)) {
    return false;
  }
  return ["title", "description", "shotType", "scene", "duration"].every((key) => typeof value[key] === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
