import type {
  ActivationCode,
  ApiResponse,
  AuthSession,
  ComicProject,
  ComicTask,
  HealthPayload,
  ImageJob,
  ImageJobResult,
  SellableModel,
  Wallet,
  WalletLedgerEntry,
} from "@commercial-studio/types";

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

function postJson<T>(options: ApiClientOptions, path: string, body: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>(options, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getHealth(options: ApiClientOptions): Promise<ApiResponse<HealthPayload>> {
  return apiRequest<HealthPayload>(options, "/health");
}

export function registerUser(
  options: ApiClientOptions,
  body: { username: string; password: string },
): Promise<ApiResponse<AuthSession>> {
  return postJson<AuthSession>(options, "/api/public/auth/register", body);
}

export function loginUser(
  options: ApiClientOptions,
  body: { username: string; password: string },
): Promise<ApiResponse<AuthSession>> {
  return postJson<AuthSession>(options, "/api/public/auth/login", body);
}

export function getCurrentUser(options: ApiClientOptions): Promise<ApiResponse<AuthSession>> {
  return apiRequest<AuthSession>(options, "/api/public/auth/me");
}

export function getWallet(options: ApiClientOptions): Promise<ApiResponse<Wallet>> {
  return apiRequest<Wallet>(options, "/api/public/wallet");
}

export function getWalletLedger(options: ApiClientOptions): Promise<ApiResponse<WalletLedgerEntry[]>> {
  return apiRequest<WalletLedgerEntry[]>(options, "/api/public/wallet/ledger");
}

export function redeemActivationCode(
  options: ApiClientOptions,
  body: { code: string },
): Promise<ApiResponse<Wallet>> {
  return postJson<Wallet>(options, "/api/public/redeem", body);
}

export function getPublicModels(options: ApiClientOptions): Promise<ApiResponse<SellableModel[]>> {
  return apiRequest<SellableModel[]>(options, "/api/public/models");
}

export function getAdminModels(options: ApiClientOptions): Promise<ApiResponse<SellableModel[]>> {
  return apiRequest<SellableModel[]>(options, "/api/admin/models");
}

export function upsertAdminModel(
  options: ApiClientOptions,
  modelCode: string,
  body: {
    display_name: string;
    capability: string;
    provider_id: number;
    provider_model: string;
    public_enabled: boolean;
    member_price_cents: number;
    anonymous_price_cents: number;
  },
): Promise<ApiResponse<SellableModel>> {
  return apiRequest<SellableModel>(options, `/api/admin/models/${modelCode}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function createImageJob(
  options: ApiClientOptions,
  body: { prompt: string; modelCode: string; requestedCount: number; mode?: "generate" | "edit" },
): Promise<ApiResponse<ImageJob>> {
  return postJson<ImageJob>(options, "/api/public/image/jobs", body);
}

export function getImageJob(options: ApiClientOptions, jobId: number): Promise<ApiResponse<ImageJob>> {
  return apiRequest<ImageJob>(options, `/api/public/image/jobs/${jobId}`);
}

export function getImageJobResults(
  options: ApiClientOptions,
  jobId: number,
): Promise<ApiResponse<ImageJobResult[]>> {
  return apiRequest<ImageJobResult[]>(options, `/api/public/image/jobs/${jobId}/results`);
}

export function getComicProjects(options: ApiClientOptions): Promise<ApiResponse<ComicProject[]>> {
  return apiRequest<ComicProject[]>(options, "/api/public/comic/projects");
}

export function createComicProject(
  options: ApiClientOptions,
  body: { title: string; sourceText?: string; stylePrompt?: string },
): Promise<ApiResponse<ComicProject>> {
  return postJson<ComicProject>(options, "/api/public/comic/projects", body);
}

export function getComicTasks(options: ApiClientOptions): Promise<ApiResponse<ComicTask[]>> {
  return apiRequest<ComicTask[]>(options, "/api/public/tasks");
}

export function getActivationCodes(options: ApiClientOptions): Promise<ApiResponse<ActivationCode[]>> {
  return apiRequest<ActivationCode[]>(options, "/api/admin/activation-codes");
}
