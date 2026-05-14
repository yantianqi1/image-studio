const DATE_TIME_FORMAT = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PROMPT_PREVIEW_LIMIT = 96;
const WHITESPACE_PATTERN = /\s+/g;

export function formatJobDateTime(value: string | null) {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return DATE_TIME_FORMAT.format(date);
}

export function formatJobOwner(userId: number | null) {
  return userId === null ? "匿名 / 客户端" : `用户 #${userId}`;
}

export function formatJobCents(value: number) {
  if (value === 0) return "免费";
  return `¥${(value / 100).toFixed(2)}`;
}

const QUALITY_LABELS: Record<string, string> = { low: "低", medium: "中", high: "高" };

export function formatJobQuality(value: string | null) {
  if (!value) return "自动";
  return QUALITY_LABELS[value] ?? value;
}

export function formatJobSize(value: string | null) {
  if (!value) return "自动";
  return value;
}

export function formatJobDuration(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function buildPromptPreview(prompt: string) {
  const normalized = prompt.replace(WHITESPACE_PATTERN, " ").trim();
  if (!normalized) {
    return "无提示词";
  }
  if (normalized.length <= PROMPT_PREVIEW_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, PROMPT_PREVIEW_LIMIT)}...`;
}
