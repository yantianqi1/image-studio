type StatusLikeError = Error & { status?: number };

const NETWORK_ERROR_PATTERNS = [/failed to fetch/i, /networkerror/i, /load failed/i];
const GENERIC_REQUEST_PREFIX = "Request failed:";

export function adminErrorMessage(error: unknown, fallback: string) {
  if (isStatusError(error, 401)) {
    return "无权限或登录已过期，请重新登录";
  }
  if (isStatusError(error, 403)) {
    const message = getErrorMessage(error);
    return isGenericRequestMessage(message) ? "无权限执行该操作" : message;
  }
  const message = getErrorMessage(error);
  if (!message) {
    return fallback;
  }
  if (isNetworkError(message)) {
    return `${fallback}：网络请求失败，请重试`;
  }
  return message;
}

function isStatusError(error: unknown, status: number) {
  return Boolean(error && typeof error === "object" && "status" in error && Number((error as StatusLikeError).status) === status);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.trim() : "";
}

function isNetworkError(message: string) {
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isGenericRequestMessage(message: string) {
  return message.startsWith(GENERIC_REQUEST_PREFIX) || message === "Forbidden";
}
