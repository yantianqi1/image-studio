import styles from "./comic-workspace.module.css";

type StatusTone = "empty" | "idle" | "pending" | "planning" | "generating" | "success" | "failed";

type StatusBadgeProps = Readonly<{
  status: string;
  label?: string;
}>;

type EmptyStateProps = Readonly<{
  title: string;
  description: string;
  icon?: string;
}>;

type ErrorStateProps = Readonly<{
  title: string;
  message: string;
  onRetry?: () => void;
}>;

const STATUS_LABELS: Readonly<Record<StatusTone, string>> = {
  empty: "等待创建项目",
  idle: "项目已创建，等待开始生成",
  pending: "等待中",
  planning: "LLM Agent 处理中",
  generating: "漫画生成中",
  success: "已完成",
  failed: "失败",
};

export function toStatusTone(status: string): StatusTone {
  if (["failed", "error"].includes(status)) {
    return "failed";
  }
  if (["completed", "succeeded", "success", "active", "character_reference_ready"].includes(status)) {
    return "success";
  }
  if (["generating", "imaging", "character_reference_generating", "page_image_generating"].includes(status)) {
    return "generating";
  }
  if (["planning", "processing", "running", "task_started", "story_analyzing", "character_designing", "storyboarding", "prompt_composing", "llm_processing"].includes(status)) {
    return "planning";
  }
  if (["queued", "pending", "waiting", "submitting", "task_queued", "character_reference_pending"].includes(status)) {
    return "pending";
  }
  if (["empty"].includes(status)) {
    return "empty";
  }
  return "idle";
}

export function statusLabel(status: string): string {
  if (status === "project_created_no_task") return "项目已创建，尚未创建生成任务";
  if (status === "task_queued") return "生成任务已排队";
  if (status === "task_started") return "后端已接手";
  if (status === "story_analyzing") return "剧情分析中";
  if (status === "character_designing") return "人物设定中";
  if (status === "storyboarding") return "分镜生成中";
  if (status === "prompt_composing") return "提示词生成中";
  if (status === "llm_processing") return "LLM Agent 处理中";
  if (status === "character_reference_pending") return "角色参考图待生成";
  if (status === "character_reference_generating") return "角色参考图生成中";
  if (status === "character_reference_ready") return "角色参考图已就绪";
  if (status === "page_image_generating") return "漫画页面生成中";
  return STATUS_LABELS[toStatusTone(status)] ?? status;
}

export function statusDescription(status: string): string {
  if (status === "submitting") return "正在提交项目与生成任务，请保持页面打开；提交失败会直接显示错误。";
  if (status === "project_created_no_task") return "项目记录已保存，但后端还没有生成任务；如果长时间停留在这里，请重新提交。每一步失败都会显示具体错误。";
  if (status === "task_queued") return "生成任务已创建并排队，正在等待后端 worker 接手处理。";
  if (status === "task_started") return "后端 worker 已领取任务，正在启动剧情分析与分镜流水线。";
  if (status === "story_analyzing") return "LLM 正在分析剧情结构、角色、冲突与视觉化叙事节奏。";
  if (status === "character_designing") return "LLM 正在生成角色卡和一致性提示词。";
  if (status === "storyboarding") return "LLM 正在按剧情分段生成多张漫画页分镜。";
  if (status === "prompt_composing") return "系统正在为每张漫画页注入风格、中文文字和角色一致性要求。";
  if (status === "llm_processing") return "后端任务正在运行：解析剧情、生成角色设定、拆分分镜并写入数据库。";
  if (status === "character_reference_pending") return "剧情与分镜已准备好，下一步会提交角色参考图生成任务。";
  if (status === "character_reference_generating") return "角色参考图正在生成，用于后续漫画页保持人物一致。";
  if (status === "character_reference_ready") return "角色参考图已就绪，正在准备提交漫画页面图片生成。";
  if (status === "page_image_generating") return "漫画图片任务已提交，正在等待图像结果写回；失败会显示具体错误。";
  if (status === "completed") return "漫画页面已生成完成，可以在右侧预览区查看结果。";
  if (status === "failed") return "流程已失败，请查看错误信息；不会用假进度伪装成功。";
  if (status === "empty") return "还没有创建漫画项目。";
  return "当前状态已更新，系统会继续同步后端任务结果。";
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const tone = toStatusTone(status);

  return (
    <span className={`${styles.statusBadge} ${styles[`status_${tone}`]}`}>
      {label ?? statusLabel(status)}
    </span>
  );
}

export function EmptyState({ title, description, icon = "✦" }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyDescription}>{description}</p>
    </div>
  );
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className={styles.errorState}>
      <div className={styles.errorIcon}>!</div>
      <div className={styles.errorCopy}>
        <p className={styles.errorTitle}>{title}</p>
        <p className={styles.errorMessage}>{message}</p>
      </div>
      {onRetry ? (
        <button className={styles.ghostButton} type="button" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}
