const STATUS_LABELS: Record<string, string> = {
  active: "启用",
  all: "全部",
  completed: "完成",
  deleted: "已删除",
  disabled: "禁用",
  enabled: "启用",
  error: "错误",
  expired: "已过期",
  failed: "失败",
  neutral: "普通",
  pending: "待处理",
  queued: "排队中",
  running: "运行中",
  soft_deleted: "软删除",
  succeeded: "成功",
  suspended: "暂停",
  warning: "告警",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.soft_delete": "软删除用户",
  "user.status.update": "更新用户状态",
};

const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: "用户",
};

const IMAGE_SOURCE_LABELS: Record<string, string> = {
  admin: "后台生成",
  anonymous: "匿名体验",
  client_provider: "自有通道",
  member: "会员生图",
};

const COMIC_TASK_TYPE_LABELS: Record<string, string> = {
  "chapter-render-batch": "章节批量渲染",
  import: "导入任务",
  "scene-render": "场景渲染",
  "script-generate": "脚本生成",
};

const COMIC_STAGE_LABELS: Record<string, string> = {
  analyzing: "剧情解析",
  characterizing: "角色分析",
  completed: "完成",
  failed: "失败",
  processing: "处理中",
  prompting: "提示词生成",
  queued: "排队中",
  storyboarding: "分镜生成",
};

const METADATA_LABELS: Record<string, string> = {
  note: "备注",
  status_from: "变更前状态",
  status_to: "变更后状态",
};

const SENSITIVE_KEY_PATTERN = /password|secret|token|api_key/i;

export function formatStatusLabel(status: string) {
  return formatKnownLabel(STATUS_LABELS, normalizeKey(status), "未知状态");
}

export function formatAuditActionLabel(action: string) {
  return formatKnownLabel(AUDIT_ACTION_LABELS, action, "未知操作");
}

export function formatAuditTargetLabel(targetType: string, targetId: number | string) {
  return `${formatAuditTargetTypeLabel(targetType)} #${targetId}`;
}

export function formatImageJobSourceLabel(source: string) {
  return formatKnownLabel(IMAGE_SOURCE_LABELS, source, "未知来源");
}

export function formatComicTaskTypeLabel(taskType: string) {
  return formatKnownLabel(COMIC_TASK_TYPE_LABELS, taskType, "未知任务");
}

export function formatComicStageLabel(stage: string) {
  return formatKnownLabel(COMIC_STAGE_LABELS, stage, "未知阶段");
}

export function formatAuditMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return "-";
  }
  return entries.map(([key, value]) => `${formatMetadataKey(key)}：${formatMetadataValue(key, value)}`).join("；");
}

function formatAuditTargetTypeLabel(targetType: string) {
  return formatKnownLabel(AUDIT_TARGET_LABELS, targetType, "未知对象");
}

function formatMetadataKey(key: string) {
  return METADATA_LABELS[key] ?? `未知字段：${key}`;
}

function formatMetadataValue(key: string, value: unknown): string {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[已隐藏]";
  }
  if (key === "status_from" || key === "status_to") {
    return typeof value === "string" ? formatStatusLabel(value) : String(value);
  }
  if (key.endsWith("_cents")) {
    return typeof value === "number" ? `${value} 分` : `${value ?? "-"} 分`;
  }
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function formatKnownLabel(labels: Record<string, string>, value: string, unknownPrefix: string) {
  const normalized = normalizeKey(value);
  return labels[normalized] ?? `${unknownPrefix}：${value}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}
