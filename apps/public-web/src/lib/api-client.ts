import { getClientProviderRequestHeaders } from "@/lib/client-provider-config";

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiRequestOptions = Readonly<{
  method?: ApiMethod;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}>;

export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly code: string | null;

  constructor(message: string, status: number, endpoint: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.code = code;
  }
}

const UNAUTHORIZED_STATUS = 401;

type ApiEnvelope<T> = Readonly<{
  data: T | null;
  meta: Record<string, unknown>;
  error: null | Readonly<{ code: string; message: string }>;
}>;

const PUBLIC_API_PREFIX = "/api/public";

export function isUnauthorizedApiError(error: unknown) {
  return error instanceof ApiError && error.status === UNAUTHORIZED_STATUS;
}

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
    throw new ApiError(payload.error.message, status, endpoint, payload.error.code);
  }

  return payload.data as T;
}

function buildApiError(payload: unknown, fallback: string, status: number, endpoint: string): ApiError {
  if (isApiEnvelope(payload) && payload.error) {
    return new ApiError(payload.error.message, status, endpoint, payload.error.code);
  }
  return new ApiError(formatApiError(payload, fallback), status, endpoint);
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
    credentials: "same-origin",
    signal: options.signal,
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw buildApiError(payload, `Request failed: ${response.status}`, response.status, endpoint);
  }

  return unwrapApiEnvelope<T>(payload, endpoint, response.status);
}

export async function apiDownload(
  path: string,
  options: Pick<ApiRequestOptions, "signal" | "token"> = {},
): Promise<Blob> {
  const endpoint = buildPublicUrl(path);
  const headers = new Headers({ Accept: "application/zip" });

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  appendClientProviderHeaders(headers);

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await readResponsePayload(response);
    throw buildApiError(payload, `Request failed: ${response.status}`, response.status, endpoint);
  }

  return response.blob();
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: Pick<ApiRequestOptions, "signal" | "token"> = {},
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
    credentials: "same-origin",
    signal: options.signal,
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw buildApiError(payload, `Request failed: ${response.status}`, response.status, endpoint);
  }

  return unwrapApiEnvelope<T>(payload, endpoint, response.status);
}
