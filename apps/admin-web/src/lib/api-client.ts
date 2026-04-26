export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiEnvelope<T> = Readonly<{
  data: T | null;
  meta: Record<string, unknown>;
  error: null | { code: string; message: string };
}>;

async function parseJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response.text();
  }
  return response.json();
}

function formatApiError(payload: unknown, status: number) {
  if (typeof payload === "string" && payload.trim()) {
    if (payload.includes("<!DOCTYPE html") || payload.includes("<html")) {
      return `Request failed: ${status} (received HTML instead of JSON)`;
    }
    return payload;
  }
  if (status === 401) {
    return "Unauthorized";
  }
  return formatObjectError(payload, status);
}

function formatObjectError(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return `Request failed: ${status}`;
  }
  const errorPayload = (payload as { error?: { message?: string } | string }).error;
  if (typeof errorPayload === "string" && errorPayload.trim()) {
    return errorPayload;
  }
  if (errorPayload && typeof errorPayload === "object" && typeof errorPayload.message === "string") {
    return errorPayload.message;
  }
  return `Request failed: ${status}`;
}

function redirectUnauthorized(status: number) {
  if (status !== 401 || typeof window === "undefined") {
    return;
  }
  if (window.location.pathname === "/login" || window.location.pathname === "/admin/login") {
    return;
  }
  window.location.replace("/admin/login");
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await parseJson(response)) as ApiEnvelope<T> | string | { error?: string };
  if (!response.ok) {
    redirectUnauthorized(response.status);
    throw new ApiError(formatApiError(payload, response.status), response.status);
  }
  return (payload as ApiEnvelope<T>).data as T;
}
