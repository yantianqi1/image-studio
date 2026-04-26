export type ComicWorkflowEventTone = "pending" | "running" | "success" | "failed";

export type ComicWorkflowEventKey =
  | "submit_project"
  | "project_created"
  | "task_queued"
  | "task_started"
  | "story_analyzing"
  | "character_designing"
  | "storyboarding"
  | "prompt_composing"
  | "llm_completed"
  | "reference_submit"
  | "reference_generating"
  | "reference_ready"
  | "page_submit"
  | "page_generating"
  | "completed"
  | "failed";

export type ComicWorkflowEvent = Readonly<{
  key: ComicWorkflowEventKey;
  title: string;
  description: string;
  tone: ComicWorkflowEventTone;
  sequence: number;
}>;

type WorkflowEventMessage = Readonly<{
  title: string;
  description: string;
  tone: ComicWorkflowEventTone;
}>;

export const WORKFLOW_EVENT_MESSAGES: Readonly<Record<ComicWorkflowEventKey, WorkflowEventMessage>> = {
  submit_project: { title: "提交项目", description: "正在把标题、剧情和漫画风格提交到后端。", tone: "running" },
  project_created: { title: "项目已创建", description: "项目记录已保存，准备创建真实漫创任务。", tone: "success" },
  task_queued: { title: "任务已入队", description: "后端 worker 已可领取任务，等待进入剧情分析。", tone: "pending" },
  task_started: { title: "任务已领取", description: "后端 worker 已领取任务，正在启动漫创流水线。", tone: "running" },
  story_analyzing: { title: "剧情分析中", description: "LLM 正在提取长文本剧情、角色、冲突、情绪节奏和视觉母题。", tone: "running" },
  character_designing: { title: "人物设定中", description: "LLM 正在生成角色卡与一致性提示词。", tone: "running" },
  storyboarding: { title: "分镜生成中", description: "LLM 正在按剧情分段生成多张漫画页分镜。", tone: "running" },
  prompt_composing: { title: "图片提示词生成中", description: "系统正在注入风格、中文文字约束和角色一致性要求。", tone: "running" },
  llm_completed: { title: "分镜与提示词已写入", description: "后端已完成剧情分析、角色设定、分镜和页面提示词。", tone: "success" },
  reference_submit: { title: "提交角色参考图", description: "正在为出场角色创建参考图任务。", tone: "running" },
  reference_generating: { title: "角色参考图生成中", description: "图像 worker 正在生成角色参考图，用于保持人物一致。", tone: "running" },
  reference_ready: { title: "角色参考图已就绪", description: "角色参考图已完成，准备提交漫画页面图片任务。", tone: "success" },
  page_submit: { title: "提交漫画页面", description: "正在为每张分镜页创建真实图片生成任务。", tone: "running" },
  page_generating: { title: "漫画页面生成中", description: "图像 worker 正在生成漫画页面，并等待结果写回。", tone: "running" },
  completed: { title: "漫创完成", description: "所有漫画页面已生成完成，可以在预览区查看。", tone: "success" },
  failed: { title: "流程失败", description: "流程已失败，错误已暴露在页面中。", tone: "failed" },
};

export function buildWorkflowEvent(
  key: ComicWorkflowEventKey,
  sequence: number,
  description?: string,
): ComicWorkflowEvent {
  const message = WORKFLOW_EVENT_MESSAGES[key];
  return {
    key,
    title: message.title,
    description: description ?? message.description,
    tone: message.tone,
    sequence,
  };
}
