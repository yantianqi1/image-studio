import { createClientId } from "@/lib/client-id";

export type ClientProviderDraft = Readonly<{
  baseUrl: string;
  apiKey: string;
}>;

export type StoredClientProviderConfig = Readonly<ClientProviderDraft & {
  clientId: string;
}>;

const BASE_URL_STORAGE_KEY = "commercial-studio.clientProvider.baseUrl";
const API_KEY_STORAGE_KEY = "commercial-studio.clientProvider.apiKey";
const CLIENT_ID_STORAGE_KEY = "commercial-studio.clientProvider.clientId";
const RESOLVED_BASE_URLS_STORAGE_KEY = "commercial-studio.clientProvider.resolvedBaseUrls";
const CLIENT_ID_PREFIX = "cs-client";
export const CLIENT_PROVIDER_DRAFT_CHANGED_EVENT = "commercial-studio-client-provider-draft-changed";

export function readStoredClientProviderConfig(): StoredClientProviderConfig {
  if (!isBrowser()) {
    return { baseUrl: "", apiKey: "", clientId: "" };
  }
  const apiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const storedBaseUrl = window.localStorage.getItem(BASE_URL_STORAGE_KEY) ?? "";
  return {
    baseUrl: storedBaseUrl.trim() || readRememberedBaseUrl(apiKey),
    apiKey,
    clientId: window.localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? "",
  };
}

export function saveClientProviderDraft(draft: ClientProviderDraft): StoredClientProviderConfig {
  if (!isBrowser()) {
    return { ...draft, clientId: "" };
  }
  const apiKey = draft.apiKey.trim();
  const submittedBaseUrl = resolveSubmittedBaseUrl(draft, apiKey);
  const baseUrl = submittedBaseUrl || readRememberedBaseUrl(apiKey);
  const next = {
    baseUrl,
    apiKey,
    clientId: ensureClientId(),
  };
  window.localStorage.setItem(BASE_URL_STORAGE_KEY, submittedBaseUrl);
  window.localStorage.setItem(API_KEY_STORAGE_KEY, next.apiKey);
  rememberBaseUrlForKey(next.apiKey, submittedBaseUrl);
  return next;
}

export function clearClientProviderConfig(): StoredClientProviderConfig {
  if (!isBrowser()) {
    return { baseUrl: "", apiKey: "", clientId: "" };
  }
  forgetBaseUrlForKey(window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? "");
  window.localStorage.removeItem(BASE_URL_STORAGE_KEY);
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  return { baseUrl: "", apiKey: "", clientId: ensureClientId() };
}

export function getClientProviderRequestHeaders(): Record<string, string> {
  const config = readStoredClientProviderConfig();
  if (!hasCompleteClientProviderConfig(config)) {
    return {};
  }
  const headers: Record<string, string> = {
    "x-client-id": config.clientId || ensureClientId(),
    "x-client-provider-api-key": config.apiKey,
  };
  if (config.baseUrl.trim()) {
    headers["x-client-provider-base-url"] = config.baseUrl;
  }
  return headers;
}

export function hasCompleteClientProviderConfig(config: ClientProviderDraft): boolean {
  return Boolean(config.apiKey.trim());
}

export function rememberResolvedClientProviderBaseUrl(baseUrl: string | null | undefined): void {
  if (!isBrowser()) {
    return;
  }
  const normalizedBaseUrl = (baseUrl ?? "").trim();
  const current = readStoredClientProviderConfig();
  if (!normalizedBaseUrl || !current.apiKey.trim()) {
    return;
  }
  rememberBaseUrlForKey(current.apiKey, normalizedBaseUrl);
  notifyClientProviderDraftChanged();
}

function ensureClientId(): string {
  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const generated = buildClientId();
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  return generated;
}

function buildClientId(): string {
  return createClientId(CLIENT_ID_PREFIX);
}

function resolveSubmittedBaseUrl(draft: ClientProviderDraft, apiKey: string): string {
  const submittedBaseUrl = draft.baseUrl.trim();
  if (!submittedBaseUrl) {
    return "";
  }
  const previousApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const previousManualBaseUrl = (window.localStorage.getItem(BASE_URL_STORAGE_KEY) ?? "").trim();
  const previousRememberedBaseUrl = readRememberedBaseUrl(previousApiKey);
  if (apiKey !== previousApiKey && !previousManualBaseUrl && submittedBaseUrl === previousRememberedBaseUrl) {
    return "";
  }
  return submittedBaseUrl;
}

function readRememberedBaseUrl(apiKey: string): string {
  if (!apiKey.trim()) {
    return "";
  }
  return readResolvedBaseUrlMap()[apiKey] ?? "";
}

function rememberBaseUrlForKey(apiKey: string, baseUrl: string): void {
  if (!apiKey.trim() || !baseUrl.trim()) {
    return;
  }
  const next = { ...readResolvedBaseUrlMap(), [apiKey]: baseUrl };
  window.localStorage.setItem(RESOLVED_BASE_URLS_STORAGE_KEY, JSON.stringify(next));
}

function forgetBaseUrlForKey(apiKey: string): void {
  if (!apiKey.trim()) {
    return;
  }
  const next = { ...readResolvedBaseUrlMap() };
  delete next[apiKey];
  window.localStorage.setItem(RESOLVED_BASE_URLS_STORAGE_KEY, JSON.stringify(next));
}

function readResolvedBaseUrlMap(): Record<string, string> {
  const parsed = JSON.parse(window.localStorage.getItem(RESOLVED_BASE_URLS_STORAGE_KEY) ?? "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("client provider resolved base url map is invalid");
  }
  return parsed as Record<string, string>;
}

function notifyClientProviderDraftChanged(): void {
  if (!isBrowser() || typeof window.dispatchEvent !== "function") {
    return;
  }
  window.dispatchEvent(new Event(CLIENT_PROVIDER_DRAFT_CHANGED_EVENT));
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}
