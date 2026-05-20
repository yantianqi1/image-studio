import { formatImageJobSourceLabel, formatStatusLabel } from "@/features/ui/admin-labels";

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
const ERROR_CODE_LABELS: Record<string, string> = {
  client_provider_url_pool_empty: "自有通道地址池为空",
  client_provider_url_unresolved: "自有通道地址未识别",
  comic_page_image_failed: "漫画页面图失败",
  comic_reference_image_failed: "角色参考图失败",
  comic_task_failed: "漫画任务失败",
  comic_task_owner_missing: "漫画任务归属缺失",
  image_job_failed: "图片任务失败",
  image_job_retry_scheduled: "图片任务已安排重试",
  provider_api_key_missing: "上游密钥未配置",
  provider_base_url_missing: "上游地址未配置",
  provider_content_refused: "上游拒绝内容",
  provider_error: "上游供应商错误",
  provider_image_download_failed: "上游图片下载失败",
  provider_model_missing: "上游模型未配置",
  provider_request_failed: "上游请求失败",
};

export function formatJobQuality(value: string | null) {
  if (!value) return "自动";
  return QUALITY_LABELS[value] ?? value;
}

export function formatJobSource(value: string) {
  return formatImageJobSourceLabel(value);
}

export function formatJobStatus(value: string) {
  return formatStatusLabel(value);
}

export function formatJobErrorText(errorCode: string | null | undefined, errorMessage: string | null | undefined) {
  const message = extractErrorMessage(errorMessage);
  const translatedMessage = message ? translateKnownErrorMessage(message) : "";
  if (translatedMessage) return translatedMessage;
  if (errorCode && ERROR_CODE_LABELS[errorCode]) return ERROR_CODE_LABELS[errorCode];
  return message || (errorCode ? `未知错误：${errorCode}` : "未知错误");
}

export function formatJobSize(value: string | null) {
  if (!value) return "自动";
  return value;
}

export function formatJobDuration(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  return `${(ms / 1000).toFixed(1)} 秒`;
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

function extractErrorMessage(message: string | null | undefined) {
  if (!message) return "";
  try {
    const parsed = JSON.parse(message) as { detail?: { error?: string }; error?: { message?: string }; message?: string };
    return parsed.detail?.error ?? parsed.error?.message ?? parsed.message ?? message;
  } catch {
    return message;
  }
}

function translateKnownErrorMessage(message: string) {
  const apiKeyMatch = message.match(/^provider api key env ([A-Z0-9_]+) is not set$/i);
  if (apiKeyMatch) return `上游密钥环境变量未配置：${apiKeyMatch[1]}`;
  const normalized = message.trim().toLowerCase();
  return KNOWN_ERROR_MESSAGES[normalized] ?? "";
}

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  "authorization is invalid": "授权无效",
  "character reference image failed": "角色参考图生成失败",
  "comic page image failed": "漫画页面图生成失败",
  "comic task owner is missing": "漫画任务归属缺失",
  "image download failed": "图片下载失败",
  "image edit failed": "图片编辑失败",
  "provider api key env missing": "上游密钥未配置",
  "provider image download failed": "上游图片下载失败",
  "provider request failed": "上游请求失败",
  "provider request retry exhausted": "上游请求重试耗尽",
  "stale running image job expired": "超时运行的图片任务已过期",
  "upstream failed": "上游调用失败",
  "upstream models request failed": "上游模型列表请求失败",
};
