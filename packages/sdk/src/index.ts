import type { ApiResponse } from "@commercial-studio/types";

const DEFAULT_CREDENTIALS: RequestCredentials = "include";

export interface ApiClientOptions {
  baseUrl: string;
  headers?: HeadersInit;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${normalizePath(path)}`;
}

export async function apiRequest<T>(
  options: ApiClientOptions,
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await fetch(buildUrl(options.baseUrl, path), {
    ...init,
    credentials: DEFAULT_CREDENTIALS,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...init?.headers,
    },
  });
  return (await response.json()) as ApiResponse<T>;
}
