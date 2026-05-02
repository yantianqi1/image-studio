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
  return `${value} cents`;
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
