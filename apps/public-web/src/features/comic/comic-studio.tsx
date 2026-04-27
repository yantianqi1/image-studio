"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/features/shell/app-shell";
import { publicApi, type ComicProject, type ComicTaskImageResult, type TaskItem } from "@/lib/public-api";
import { type ResourceState, useApiResource } from "@/lib/use-api-resource";

import { ensureComicAnonymousSession, listenComicOwnerChanged } from "./comic-anonymous-session";
import { DEFAULT_CHARACTER_REFERENCE_MODE, type CharacterReferenceMode } from "./character-reference-modes";
import { DEFAULT_COMIC_STYLE_PRESET, type ComicStylePresetId } from "./comic-style-presets";
import { deriveComicWorkspaceStatus, deriveComicWorkspaceStatusFromTask, type ComicWorkspaceStatus } from "./comic-state";
import { latestProject, type StoryboardShot } from "./comic-utils";
import {
  buildShots,
  buildPersistedWorkflowEvents,
  buildTaskInputPayload,
  derivePersistentWorkspaceStatus,
  getPreviewError,
  selectLatestTask,
  shouldAutoRefreshComic,
  TASK_TYPE_SCENE_RENDER,
  taskStageEventKey,
  taskStageEventDescription,
  useComicTaskImageResults,
  waitForCharacterReferences,
  waitForComicTask,
  waitForPageImages,
} from "./comic-studio-helpers";
import { buildWorkflowEvent, type ComicWorkflowEvent, type ComicWorkflowEventKey } from "./comic-workflow-events";
import { MangaPreviewPanel } from "./manga-preview-panel";
import { MangaProjectPanel } from "./manga-project-panel";
import { StoryboardPlanningPanel } from "./storyboard-planning-panel";
import styles from "./comic-workspace.module.css";

const AUTO_REFRESH_INTERVAL_MS = 3000;

type CreateState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; title: string; projectId: string }>;

type StudioModel = Readonly<{
  title: string;
  premise: string;
  stylePresetId: ComicStylePresetId;
  characterReferenceMode: CharacterReferenceMode;
  referencePackFileName: string | null;
  referencePackStatus: ReferencePackStatus;
  referencePackMessage?: string;
  workflowEvents: readonly ComicWorkflowEvent[];
  createState: CreateState;
  projectsState: ResourceState<readonly ComicProject[]>;
  tasksState: ResourceState<readonly TaskItem[]>;
  imageResultsState: ResourceState<readonly ComicTaskImageResult[]>;
  shots: readonly StoryboardShot[];
  selectedShotId: string | null;
  selectedShot: StoryboardShot | null;
  projectTitle: string;
  workspaceStatus: string;
  previewError?: string;
  setTitle: (value: string) => void;
  setPremise: (value: string) => void;
  setStylePresetId: (value: ComicStylePresetId) => void;
  setCharacterReferenceMode: (value: CharacterReferenceMode) => void;
  setReferencePackFile: (value: File | null) => void;
  setSelectedShotId: (value: string | null) => void;
  handleCreateProject: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleExportReferencePack: () => Promise<void>;
  handleImportReferencePack: () => Promise<void>;
  handleRefresh: () => void;
}>;

type ReferencePackStatus = "idle" | "exporting" | "importing" | "error" | "success";

export function ComicStudio() {
  const studio = useComicStudio();

  return (
    <AppShell activeHref="/comic" title="漫画工作室" workspaceMode>
      <div className={styles.workspace}>
        <MangaProjectPanel
          title={studio.title}
          premise={studio.premise}
          stylePresetId={studio.stylePresetId}
          characterReferenceMode={studio.characterReferenceMode}
          referencePackFileName={studio.referencePackFileName}
          referencePackStatus={studio.referencePackStatus}
          referencePackMessage={studio.referencePackMessage}
          workflowStatus={studio.workspaceStatus}
          workflowError={studio.previewError}
          workflowEvents={studio.workflowEvents}
          createState={studio.createState}
          onTitleChange={studio.setTitle}
          onPremiseChange={studio.setPremise}
          onStylePresetChange={studio.setStylePresetId}
          onCharacterReferenceModeChange={studio.setCharacterReferenceMode}
          onReferencePackFileChange={studio.setReferencePackFile}
          onExportReferencePack={studio.handleExportReferencePack}
          onImportReferencePack={studio.handleImportReferencePack}
          onCreateProject={studio.handleCreateProject}
        />
        <StoryboardPlanningPanel
          shots={studio.shots}
          selectedShotId={studio.selectedShotId}
          status={studio.workspaceStatus}
          onSelectShot={studio.setSelectedShotId}
        />
        <MangaPreviewPanel
          shots={studio.shots}
          selectedShot={studio.selectedShot}
          projectTitle={studio.projectTitle}
          status={studio.workspaceStatus}
          errorMessage={studio.previewError}
          onSelectShot={studio.setSelectedShotId}
          onRetry={studio.handleRefresh}
        />
      </div>
    </AppShell>
  );
}

function useComicStudio(): StudioModel {
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [stylePresetId, setStylePresetId] = useState<ComicStylePresetId>(DEFAULT_COMIC_STYLE_PRESET);
  const [characterReferenceMode, setCharacterReferenceMode] = useState<CharacterReferenceMode>(DEFAULT_CHARACTER_REFERENCE_MODE);
  const [referencePackFile, setReferencePackFile] = useState<File | null>(null);
  const [referencePackStatus, setReferencePackStatus] = useState<ReferencePackStatus>("idle");
  const [referencePackMessage, setReferencePackMessage] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [ownerRefreshKey, setOwnerRefreshKey] = useState(0);
  const [ownerState, setOwnerState] = useState<ResourceState<null>>({ status: "loading" });
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [workflowStatus, setWorkflowStatus] = useState<ComicWorkspaceStatus | null>(null);
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const [workflowEvents, setWorkflowEvents] = useState<readonly ComicWorkflowEvent[]>([]);

  const rawProjectsState = useApiResource(() => loadOwnerScopedCollection(ownerState, publicApi.getComicProjects), refreshKey);
  const rawTasksState = useApiResource(() => loadOwnerScopedCollection(ownerState, publicApi.getComicTasks), refreshKey);
  const projectsState = resolveOwnerScopedState(ownerState, rawProjectsState);
  const tasksState = resolveOwnerScopedState(ownerState, rawTasksState);
  const latestTask = useMemo(() => selectLatestTask(tasksState), [tasksState]);
  const imageResultsState = useComicTaskImageResults(latestTask?.id ?? null, refreshKey);
  const shots = useMemo(
    () => buildShots(tasksState, imageResultsState),
    [tasksState, imageResultsState],
  );
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots[0] ?? null;
  const projectTitle = resolveProjectTitleForExport(projectsState, createState, title);
  const baseWorkspaceStatus = deriveComicWorkspaceStatus(projectsState, tasksState, createState.status);
  const persistedWorkspaceStatus = derivePersistentWorkspaceStatus(baseWorkspaceStatus, latestTask, imageResultsState);
  const workspaceStatus = workflowStatus ?? persistedWorkspaceStatus;
  const persistedWorkflowEvents = useMemo(
    () => buildPersistedWorkflowEvents(latestTask, imageResultsState),
    [latestTask, imageResultsState],
  );
  const visibleWorkflowEvents = workflowEvents.length > 0 ? workflowEvents : persistedWorkflowEvents;
  const previewError = workflowError ?? getPreviewError(projectsState, tasksState, imageResultsState);

  useEffect(() => {
    let active = true;
    setOwnerState({ status: "loading" });
    ensureComicAnonymousSession()
      .then(() => {
        if (!active) return;
        setOwnerState({ status: "ready", data: null });
        handleRefresh();
      })
      .catch((error: unknown) => {
        if (active) setOwnerState({ status: "error", message: errorMessage(error, "漫画身份初始化失败") });
      });
    return () => {
      active = false;
    };
  }, [ownerRefreshKey]);

  useEffect(() => listenComicOwnerChanged(handleOwnerChanged), []);

  useEffect(() => {
    if (!shouldAutoRefreshComic(workspaceStatus)) {
      return undefined;
    }
    const timer = window.setInterval(handleRefresh, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [workspaceStatus]);

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateState({ status: "submitting" });
    setWorkflowError(undefined);
    setWorkflowStatus("submitting");
    setWorkflowEvents([buildWorkflowEvent("submit_project", 1)]);

    try {
      const result = await publicApi.createComicProject({
        title,
        sourceText: premise,
        stylePrompt: stylePresetId,
      });
      setWorkflowStatus("project_created_no_task");
      appendWorkflowEvent("project_created");
      const task = await publicApi.createComicTask({
        project_id: result.id,
        task_type: TASK_TYPE_SCENE_RENDER,
        input_payload: buildTaskInputPayload(premise, stylePresetId, characterReferenceMode),
      });
      const packFile = referencePackFile;
      setTitle("");
      setPremise("");
      setStylePresetId(DEFAULT_COMIC_STYLE_PRESET);
      setCharacterReferenceMode(DEFAULT_CHARACTER_REFERENCE_MODE);
      setReferencePackFile(null);
      setCreateState({ status: "success", title: result.title, projectId: result.id });
      handleRefresh();
      await runComicWorkflow(String(task.id), packFile);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "漫创流程失败";
      setWorkflowStatus("failed");
      setWorkflowError(message);
      appendWorkflowEvent("failed", message);
      setCreateState({ status: "error", message });
    }
  }

  async function runComicWorkflow(taskId: string, packFile: File | null) {
    setWorkflowStatus("task_queued");
    appendWorkflowEvent("task_queued");
    await waitForComicTask(taskId, appendTaskStageEvent);
    const importedPackReady = await importPackForTask(taskId, packFile);
    if (!importedPackReady) {
      setWorkflowStatus("character_reference_generating");
      appendWorkflowEvent("reference_generating", "后端 worker 正在自动创建并处理角色参考图任务。");
    }
    await waitForCharacterReferences(taskId);
    setWorkflowStatus("character_reference_ready");
    appendWorkflowEvent("reference_ready");
    setWorkflowStatus("page_image_generating");
    appendWorkflowEvent("page_generating", "后端 worker 正在自动创建并处理漫画页面图片任务。");
    await waitForPageImages(taskId);
    setWorkflowStatus("completed");
    appendWorkflowEvent("completed");
    handleRefresh();
  }

  async function importPackForTask(taskId: string, packFile: File | null): Promise<boolean> {
    if (!packFile) return false;
    setReferencePackStatus("importing");
    setReferencePackMessage("正在导入人设图包");
    const result = await publicApi.importComicCharacterReferencePack(taskId, packFile);
    setReferencePackStatus("success");
    setReferencePackMessage(`已导入 ${result.imported_count} 个角色`);
    handleRefresh();
    return result.ready;
  }

  async function handleExportReferencePack() {
    const taskId = latestTask?.id;
    if (taskId === undefined) return setReferencePackError("没有可导出的人设任务");
    setReferencePackStatus("exporting");
    setReferencePackMessage(undefined);
    try {
      const archive = await publicApi.downloadComicCharacterReferencePack(String(taskId));
      triggerZipDownload(archive, projectTitle);
      setReferencePackStatus("success");
      setReferencePackMessage("人设图包已导出");
    } catch (error: unknown) {
      setReferencePackError(errorMessage(error, "人设图包导出失败"));
    }
  }

  async function handleImportReferencePack() {
    const taskId = latestTask?.id;
    if (taskId === undefined) return setReferencePackError("没有可导入的人设任务");
    if (!referencePackFile) return setReferencePackError("请选择 zip 人设图包");
    try {
      await importPackForTask(String(taskId), referencePackFile);
    } catch (error: unknown) {
      setReferencePackError(errorMessage(error, "人设图包导入失败"));
    }
  }

  function setReferencePackError(message: string) {
    setReferencePackStatus("error");
    setReferencePackMessage(message);
  }

  function appendWorkflowEvent(key: ComicWorkflowEventKey, description?: string) {
    setWorkflowEvents((current) => {
      const existingIndex = current.findIndex((event) => event.key === key);
      if (key !== "failed" && existingIndex >= 0 && !description) {
        return current;
      }
      if (key !== "failed" && existingIndex >= 0) return replaceWorkflowEvent(current, existingIndex, description);
      return [...current, buildWorkflowEvent(key, current.length + 1, description)];
    });
  }

  function appendTaskStageEvent(task: TaskItem) {
    setWorkflowStatus(deriveComicWorkspaceStatusFromTask(task));
    const eventKey = taskStageEventKey(task);
    if (eventKey) appendWorkflowEvent(eventKey, taskStageEventDescription(task));
  }

  function handleRefresh() {
    setRefreshKey((current) => current + 1);
  }

  function handleOwnerChanged() {
    resetOwnerScopedDisplayState();
    setOwnerRefreshKey((current) => current + 1);
  }

  function resetOwnerScopedDisplayState() {
    setSelectedShotId(null);
    setCreateState({ status: "idle" });
    setWorkflowStatus(null);
    setWorkflowError(undefined);
    setWorkflowEvents([]);
  }

  return {
    title,
    premise,
    stylePresetId,
    characterReferenceMode,
    referencePackFileName: referencePackFile?.name ?? null,
    referencePackStatus,
    referencePackMessage,
    workflowEvents: visibleWorkflowEvents,
    createState,
    projectsState,
    tasksState,
    imageResultsState,
    shots,
    selectedShotId: selectedShot?.id ?? null,
    selectedShot,
    projectTitle,
    workspaceStatus,
    previewError,
    setTitle,
    setPremise,
    setStylePresetId,
    setCharacterReferenceMode,
    setReferencePackFile,
    setSelectedShotId,
    handleCreateProject,
    handleExportReferencePack,
    handleImportReferencePack,
    handleRefresh,
  };
}

function triggerZipDownload(archive: Blob, projectTitle: string) {
  const url = URL.createObjectURL(archive);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resolveProjectTitleForFile(projectTitle)}-人设图包.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resolveProjectTitleForFile(projectTitle: string): string {
  const safeTitle = projectTitle.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return safeTitle || "comic-character-references";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function loadOwnerScopedCollection<T>(ownerState: ResourceState<null>, loader: () => Promise<readonly T[]>): Promise<readonly T[]> {
  if (ownerState.status !== "ready") {
    return Promise.resolve([]);
  }
  return loader();
}

function resolveOwnerScopedState<T>(ownerState: ResourceState<null>, resourceState: ResourceState<T>): ResourceState<T> {
  if (ownerState.status === "ready") {
    return resourceState;
  }
  if (ownerState.status === "loading") {
    return { status: "loading" };
  }
  return { status: "error", message: ownerState.message, statusCode: ownerState.statusCode };
}

function resolveProjectTitleForExport(
  projectsState: ResourceState<readonly ComicProject[]>,
  createState: CreateState,
  draftTitle: string,
): string {
  if (projectsState.status === "ready") {
    const project = latestProject(projectsState.data);
    if (project) return project.title;
  }
  if (createState.status === "success") return createState.title;
  return draftTitle;
}

function replaceWorkflowEvent(
  events: readonly ComicWorkflowEvent[],
  index: number,
  description?: string,
): readonly ComicWorkflowEvent[] {
  const event = events[index];
  if (!event || !description || event.description === description) {
    return events;
  }
  return events.map((item, itemIndex) => (itemIndex === index ? { ...item, description } : item));
}
