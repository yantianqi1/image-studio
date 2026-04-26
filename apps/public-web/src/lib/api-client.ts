import { getClientProviderRequestHeaders } from "@/lib/client-provider-config";

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiRequestOptions = Readonly<{
  method?: ApiMethod;
  body?: unknown;
  token?: string;
}>;

export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

type ApiEnvelope<T> = Readonly<{
  data: T | null;
  meta: Record<string, unknown>;
  error: null | Readonly<{ code: string; message: string }>;
}>;

const PUBLIC_API_PREFIX = "/api/public";

function buildPublicUrl(path: string) {
  if (!path.startsWith("/")) {
    throw new Error(`Public API path must start with "/": ${path}`);
  }

  return `${PUBLIC_API_PREFIX}${path}`;
}

function buildHeaders(options: ApiRequestOptions) {
  const headers = new Headers({ Accept: "application/json" });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  appendClientProviderHeaders(headers);
  return headers;
}

function appendClientProviderHeaders(headers: Headers) {
  const clientProviderHeaders = getClientProviderRequestHeaders();
  for (const [key, value] of Object.entries(clientProviderHeaders)) {
    headers.set(key, value);
  }
}

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return response.text();
  }

  return response.json();
}

function formatApiError(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) {
    if (payload.includes("<!DOCTYPE html") || payload.includes("<html")) {
      return `${fallback} (received HTML instead of JSON)`;
    }
    return payload;
  }

  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  }

  return fallback;
}

function isApiEnvelope(payload: unknown): payload is ApiEnvelope<unknown> {
  return (
    payload !== null &&
    typeof payload === "object" &&
    "data" in payload &&
    "meta" in payload &&
    "error" in payload
  );
}

function unwrapApiEnvelope<T>(payload: unknown, endpoint: string, status: number): T {
  if (!isApiEnvelope(payload)) {
    throw new ApiError(`Invalid API envelope from ${endpoint}`, status, endpoint);
  }

  if (payload.error) {
    throw new ApiError(payload.error.message, status, endpoint);
  }

  return payload.data as T;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const endpoint = buildPublicUrl(path);
  const response = await fetch(endpoint, {
    method: options.method ?? "GET",
    headers: buildHeaders(options),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    const message = isApiEnvelope(payload)
      ? payload.error?.message ?? `Request failed: ${response.status}`
      : formatApiError(payload, `Request failed: ${response.status}`);
    throw new ApiError(message, response.status, endpoint);
  }

  return unwrapApiEnvelope<T>(payload, endpoint, response.status);
}


export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: Pick<ApiRequestOptions, "token"> = {},
): Promise<T> {
  const endpoint = buildPublicUrl(path);
  const headers = new Headers({ Accept: "application/json" });

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  appendClientProviderHeaders(headers);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    const message = isApiEnvelope(payload)
      ? payload.error?.message ?? `Request failed: ${response.status}`
      : formatApiError(payload, `Request failed: ${response.status}`);
    throw new ApiError(message, response.status, endpoint);
  }

  return unwrapApiEnvelope<T>(payload, endpoint, response.status);
}
